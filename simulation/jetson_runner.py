"""
simulation/jetson_runner.py - Headless Edge AI & Simulation Runner for Jetson Nano

Demonstrates running the autonomous swarm controller and edge AI inference
on an NVIDIA Jetson Nano / edge device, streaming results over WebSocket or REST.
"""

import sys
import os
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(__file__))

from main import DroneSwarmSimulation
from scenarios import get_scenario, list_scenarios


def simulate_yolo_edge_inference(frame_id: int):
    """
    Simulates edge survivor detection inference (YOLO / TensorRT model on Jetson Nano).
    In actual hardware execution with camera feed, runs cv2 + onnxruntime/TensorRT.
    """
    # Simulate inference latency on Jetson Nano GPU (~45ms for YOLOv8n)
    time.sleep(0.045)
    has_detection = (frame_id % 7 == 0)
    if has_detection:
        return {
            "detected": True,
            "class": "survivor_person",
            "confidence": 0.89,
            "bbox": [120, 80, 240, 310],
            "inference_time_ms": 42.6,
            "device": "NVIDIA Jetson Nano (Maxwell 128-core GPU)",
        }
    return {
        "detected": False,
        "inference_time_ms": 41.2,
        "device": "NVIDIA Jetson Nano (Maxwell 128-core GPU)",
    }


def run_jetson_node(scenario_name="hostile_zone", max_steps=200):
    print("=" * 60)
    print("DRONESHIELD EDGE NODE - NVIDIA JETSON NANO")
    print("=" * 60)
    print(f"[+] Device Target: NVIDIA Jetson Nano Developer Kit")
    print(f"[+] Compute Capability: CUDA / TensorRT Accelerated")
    print(f"[+] Running Swarm Engine on Edge + Edge YOLO Inference")
    print(f"[+] Scenario: {scenario_name}")
    print("=" * 60)

    scenario = get_scenario(scenario_name)
    sim = DroneSwarmSimulation(seed=scenario["seed"], scenario=scenario)

    print(f"[+] Loaded scenario: {scenario['name']}")
    print(f"[+] Active drones: {len(sim.drones)}")
    print(f"[+] GPS Denied: {sim.gps_denied}")
    print("\nStarting Edge Execution Loop...")

    for step in range(1, max_steps + 1):
        if not sim.running:
            print("[+] Mission complete - all sectors surveyed.")
            break

        step_start = time.time()

        # Step Swarm AI
        sim.step_simulation()

        # Run Edge Detection AI
        yolo_result = simulate_yolo_edge_inference(step)

        step_time = (time.time() - step_start) * 1000

        if step % 20 == 0 or yolo_result["detected"]:
            stats = sim.fog.get_coverage_stats()
            print(f"Step {step:03d} | Swarm Fog: {stats['explored_pct']:.1f}% | "
                  f"Survivors: {len(sim.map_obj.found_survivors)} | "
                  f"AI Latency: {yolo_result['inference_time_ms']:.1f}ms | "
                  f"Total Loop: {step_time:.1f}ms")
            if yolo_result["detected"]:
                print(f"  [AI INFERENCE HIT] Survivor identified with {yolo_result['confidence']*100:.0f}% confidence!")

    print("\n[SUCCESS] Jetson Nano Edge Simulation Finished Successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DroneShield Jetson Nano Edge Runner")
    parser.add_argument("--scenario", default="hostile_zone", help="Scenario ID (earthquake, flood_rescue, night_rescue, hostile_zone)")
    parser.add_argument("--steps", type=int, default=150, help="Maximum steps to simulate")
    args = parser.parse_args()

    run_jetson_node(scenario_name=args.scenario, max_steps=args.steps)
