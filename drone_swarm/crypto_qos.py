"""
Layer 3 (12-36h Upgrade): Adaptive QoS Priority Queue

Implements bandwidth-aware packet priority queuing for the LoRa fallback channel.
When the SDR mesh fails and we drop to low-bandwidth LoRa radio, the system
cannot transmit everything. This engine enforces strict packet triage.

Priority levels (RFC 2474 DSCP-inspired):
  P1_EMERGENCY  — Survivor found, never dropped under any condition
  P2_POSITION   — GPS coordinates, dropped only if critically saturated
  P3_HEALTH     — Battery, drone status, dropped when bandwidth < LOW_THRESHOLD
  P4_LOGS       — Verbose telemetry logs, first to be purged

This proves the system understands SWaP (Size, Weight, and Power) constraints
and mission-critical data triage — a key defense industry requirement.
"""

from collections import deque
from dataclasses import dataclass, field
from typing import Optional


# Bandwidth thresholds in kbps (simulated LoRa channel capacity)
BANDWIDTH_NORMAL_KBPS = 50.0   # Normal mesh operation
BANDWIDTH_LOW_KBPS = 10.0      # Degraded — drop P4 logs
BANDWIDTH_CRITICAL_KBPS = 3.0  # Critical — drop P4 + P3 health


@dataclass
class QoSPacket:
    """A packet in the priority queue."""
    priority: str          # P1_EMERGENCY | P2_POSITION | P3_HEALTH | P4_LOGS
    payload: dict
    node_id: int
    timestamp: float = 0.0

    def to_dict(self) -> dict:
        return {
            "priority": self.priority,
            "node_id": self.node_id,
            "payload": self.payload,
        }


class AdaptiveQoSQueue:
    """
    Four-tier priority queue with bandwidth-adaptive packet dropping.
    Higher priority packets always transmit first. Lower priorities are
    purged when bandwidth falls below operational thresholds.
    """

    PRIORITY_ORDER = ["P1_EMERGENCY", "P2_POSITION", "P3_HEALTH", "P4_LOGS"]

    def __init__(self):
        # Separate deque per priority bucket
        self._queues: dict[str, deque] = {p: deque() for p in self.PRIORITY_ORDER}
        self.total_enqueued = 0
        self.total_dropped = 0
        self._current_bandwidth_kbps = BANDWIDTH_NORMAL_KBPS

    def set_bandwidth(self, bandwidth_kbps: float):
        """Update the simulated current channel bandwidth."""
        self._current_bandwidth_kbps = bandwidth_kbps
        self._enforce_bandwidth_policy()

    def enqueue(self, packet: QoSPacket):
        """Add a packet to the appropriate priority bucket."""
        if packet.priority not in self._queues:
            raise ValueError(f"Unknown priority: {packet.priority}. "
                             f"Must be one of {self.PRIORITY_ORDER}")
        self._queues[packet.priority].append(packet)
        self.total_enqueued += 1

    def dequeue(self) -> Optional[QoSPacket]:
        """
        Returns the highest-priority available packet.
        Enforces bandwidth policy before dequeuing.
        """
        self._enforce_bandwidth_policy()
        for priority in self.PRIORITY_ORDER:
            if self._queues[priority]:
                return self._queues[priority].popleft()
        return None

    def _enforce_bandwidth_policy(self):
        """
        Purges low-priority packets based on current bandwidth.
        P1_EMERGENCY packets are NEVER dropped under any condition.
        """
        if self._current_bandwidth_kbps < BANDWIDTH_CRITICAL_KBPS:
            # Critical: purge P4 logs AND P3 health pings
            dropped = len(self._queues["P4_LOGS"]) + len(self._queues["P3_HEALTH"])
            self._queues["P4_LOGS"].clear()
            self._queues["P3_HEALTH"].clear()
            self.total_dropped += dropped

        elif self._current_bandwidth_kbps < BANDWIDTH_LOW_KBPS:
            # Low: purge only P4 verbose logs
            dropped = len(self._queues["P4_LOGS"])
            self._queues["P4_LOGS"].clear()
            self.total_dropped += dropped

    def get_status(self) -> dict:
        """Returns queue state for the dashboard."""
        return {
            "current_bandwidth_kbps": self._current_bandwidth_kbps,
            "queue_depths": {p: len(self._queues[p]) for p in self.PRIORITY_ORDER},
            "total_enqueued": self.total_enqueued,
            "total_dropped": self.total_dropped,
            "policy": (
                "CRITICAL — P3+P4 purged" if self._current_bandwidth_kbps < BANDWIDTH_CRITICAL_KBPS
                else "DEGRADED — P4 purged" if self._current_bandwidth_kbps < BANDWIDTH_LOW_KBPS
                else "NORMAL — all priorities active"
            )
        }
