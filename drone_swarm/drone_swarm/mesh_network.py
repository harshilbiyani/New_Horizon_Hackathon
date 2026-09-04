"""
Hop-to-hop mesh networking layer.

Two backends are provided:

  - SimulatedMeshNetwork: in-memory, distance-based neighbor discovery.
    Used for the simulation/demo and for testing reallocation logic
    without any real radios.

  - UDPMeshNode: a genuine, deployable ad-hoc broadcast implementation
    using plain UDP sockets with TTL-limited flooding (an "AODV-lite"
    scheme, exactly the "flooding-with-TTL" option discussed as the
    simplest hop-to-hop protocol to implement in a hackathon timeframe).
    This runs on any Linux companion computer (Raspberry Pi / Jetson /
    laptop) whose radio link exposes itself as a network interface --
    Wi-Fi in ad-hoc/mesh mode, or a LoRa/900MHz radio bridged to serial
    and then to a network tap. It does NOT depend on any specific vendor
    SDK or hardware (e.g. Doodle Labs, Silvus) -- those require actual
    procured radios to test against, which isn't something that can be
    verified here, so this is the vendor-agnostic, real-systems version
    of the same idea instead.
"""
import json
import socket
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Callable, Optional
from .drone import Drone


@dataclass
class NeighborInfo:
    drone_id: int
    position: tuple
    battery_pct: float
    role: str
    last_seen: float


class SimulatedMeshNetwork:
    """Distance-based neighbor discovery for simulation/testing."""

    def __init__(self, drones: List[Drone], comm_range_m: float):
        self.drones = {d.drone_id: d for d in drones}
        self.comm_range_m = comm_range_m

    def neighbors_of(self, drone_id: int) -> List[int]:
        d = self.drones[drone_id]
        return [
            other.drone_id for other in self.drones.values()
            if other.drone_id != drone_id and other.is_alive
            and d.distance_to(other) <= self.comm_range_m
        ]

    def is_connected_to_base(self, drone_id: int, relay_ids: List[int]) -> bool:
        """BFS over the live neighbor graph: can this drone reach any relay
        (and therefore the base) via TTL flooding?"""
        if drone_id in relay_ids:
            return True
        visited = {drone_id}
        frontier = [drone_id]
        while frontier:
            nxt = []
            for did in frontier:
                for n in self.neighbors_of(did):
                    if n in relay_ids:
                        return True
                    if n not in visited:
                        visited.add(n)
                        nxt.append(n)
            frontier = nxt
        return False


class UDPMeshNode:
    """Real, hardware-runnable ad-hoc mesh node (heartbeats + TTL flooding)."""

    def __init__(self, drone_id: int, port: int = 50000, broadcast_ip: str = "255.255.255.255"):
        self.drone_id = drone_id
        self.port = port
        self.broadcast_ip = broadcast_ip
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.bind(("", port))
        self.neighbors: Dict[int, NeighborInfo] = {}
        self.seen_msg_ids = set()
        self._running = False
        self.on_message: Optional[Callable[[dict], None]] = None

    def start(self):
        self._running = True
        threading.Thread(target=self._listen_loop, daemon=True).start()

    def stop(self):
        self._running = False
        try:
            self.sock.close()
        except OSError:
            pass

    def broadcast_heartbeat(self, position, battery_pct, role):
        self._send({
            "type": "heartbeat",
            "drone_id": self.drone_id,
            "position": position,
            "battery_pct": battery_pct,
            "role": role,
            "ts": time.time(),
        })

    def flood(self, message: dict, ttl: int = 5):
        """Send `message` outward; every receiving node rebroadcasts once
        (decrementing ttl) until it hits zero, giving multi-hop range
        without any routing tables."""
        msg_id = f"{self.drone_id}-{time.time()}"
        self.seen_msg_ids.add(msg_id)
        self._send({"type": "flood", "msg_id": msg_id, "ttl": ttl, "body": message})

    def _send(self, payload: dict):
        data = json.dumps(payload).encode("utf-8")
        self.sock.sendto(data, (self.broadcast_ip, self.port))

    def _listen_loop(self):
        self.sock.settimeout(1.0)
        while self._running:
            try:
                data, _ = self.sock.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            try:
                payload = json.loads(data.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            self._handle(payload)

    def _handle(self, payload: dict):
        if payload.get("drone_id") == self.drone_id:
            return
        if payload["type"] == "heartbeat":
            self.neighbors[payload["drone_id"]] = NeighborInfo(
                drone_id=payload["drone_id"], position=tuple(payload["position"]),
                battery_pct=payload["battery_pct"], role=payload["role"], last_seen=payload["ts"],
            )
        elif payload["type"] == "flood":
            msg_id = payload["msg_id"]
            if msg_id in self.seen_msg_ids:
                return
            self.seen_msg_ids.add(msg_id)
            if self.on_message:
                self.on_message(payload["body"])
            if payload["ttl"] > 0:
                payload["ttl"] -= 1
                self._send(payload)

    def stale_neighbors(self, timeout_s: float = 5.0) -> List[int]:
        now = time.time()
        return [nid for nid, n in self.neighbors.items() if now - n.last_seen > timeout_s]
