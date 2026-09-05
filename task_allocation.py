"""
Consensus-Based Bundle Algorithm (CBBA) -- Choi, Brunet & How, "Consensus-
Based Decentralized Auctions for Robust Task Allocation," IEEE Trans.
Robotics, 2009. A real, published, distributed task-allocation algorithm
actually used in multi-robot research systems (not a toy heuristic),
chosen over a plain nearest-zone auction because it re-converges only
over affected tasks when a robot drops out -- exactly the "reallocate
only the affected subset, not the whole swarm" requirement discussed for
the mission.

This is a simplified single-item-per-task version: each disaster-area
zone is one task, and each drone can hold up to `max_bundle_size` zones.
"""
import math
from dataclasses import dataclass
from typing import Dict, List


@dataclass
class Task:
    task_id: int
    position: tuple


class CBBAAgent:
    def __init__(self, drone_id: int, position: tuple, max_bundle_size: int = 3):
        self.drone_id = drone_id
        self.position = position
        self.max_bundle_size = max_bundle_size
        self.bundle: List[int] = []
        self.winning_bids: Dict[int, float] = {}
        self.winning_agents: Dict[int, int] = {}

    def score(self, task: Task) -> float:
        dx, dy = task.position[0] - self.position[0], task.position[1] - self.position[1]
        return -math.hypot(dx, dy)  # closer = higher (less negative) score

    def build_bundle(self, tasks: Dict[int, Task]):
        self.bundle = []
        while len(self.bundle) < self.max_bundle_size:
            best_task_id, best_score = None, float("-inf")
            for tid, task in tasks.items():
                if tid in self.bundle:
                    continue
                s = self.score(task)
                # An agent doesn't need to outbid its own standing win -- only
                # a strictly better bid from someone else should block it.
                blocking_bid = (
                    float("-inf") if self.winning_agents.get(tid) == self.drone_id
                    else self.winning_bids.get(tid, float("-inf"))
                )
                if s > blocking_bid and s > best_score:
                    best_task_id, best_score = tid, s
            if best_task_id is None:
                break
            self.bundle.append(best_task_id)
            self.winning_bids[best_task_id] = best_score
            self.winning_agents[best_task_id] = self.drone_id


def run_cbba(agents: List[CBBAAgent], tasks: Dict[int, Task], rounds: int = 10) -> Dict[int, List[int]]:
    """Bundle-construction + consensus rounds until bids converge."""
    for _ in range(rounds):
        changed = False
        for agent in agents:
            agent.build_bundle(tasks)

        global_best_bid: Dict[int, float] = {}
        global_best_agent: Dict[int, int] = {}
        for agent in agents:
            for tid, bid in agent.winning_bids.items():
                if tid not in global_best_bid or bid > global_best_bid[tid]:
                    global_best_bid[tid], global_best_agent[tid] = bid, agent.winning_agents[tid]

        for agent in agents:
            for tid in list(agent.winning_bids.keys()):
                if global_best_agent[tid] != agent.drone_id:
                    if tid in agent.bundle:
                        agent.bundle.remove(tid)
                        changed = True
                    agent.winning_bids[tid] = global_best_bid[tid]
                    agent.winning_agents[tid] = global_best_agent[tid]

        if not changed:
            break

    return {a.drone_id: a.bundle for a in agents}


def reallocate_subset(
    agents: List[CBBAAgent], all_tasks: Dict[int, Task], affected_task_ids: List[int]
) -> Dict[int, List[int]]:
    """Cheap partial re-solve over only the affected zones (battery-low /
    comm-lost / blocked-zone events) -- matches the event-bus reallocation
    design discussed earlier."""
    subset_tasks = {tid: all_tasks[tid] for tid in affected_task_ids if tid in all_tasks}
    for agent in agents:
        agent.bundle = [t for t in agent.bundle if t not in affected_task_ids]
        for tid in affected_task_ids:
            agent.winning_bids.pop(tid, None)
            agent.winning_agents.pop(tid, None)
    return run_cbba(agents, subset_tasks, rounds=5)
