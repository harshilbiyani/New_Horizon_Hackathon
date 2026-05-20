# test_detector.py

from survivor_detector import generate_survivors, detect_survivors
from confidence_scorer import compute_confidence

# ── Scorer standalone test ──────────────────────────────────────────
print("=" * 50)
print("  CONFIDENCE SCORER — STANDALONE TEST")
print("=" * 50)

test_cases = [
    ("Very close (dist=0.5)", 0.5, 3),
    ("Mid range  (dist=1.5)", 1.5, 3),
    ("Edge range (dist=2.8)", 2.8, 3),
    ("Out of range(dist=3.5)", 3.5, 3),
]

for label, dist, radius in test_cases:
    result = compute_confidence(dist, radius, drone_id=1)
    print(f"\n  {label}")
    print(f"    Final score : {result['final_score']}  [{result['label']}]")
    print(f"    Proximity   : {result['signals']['proximity']}")
    print(f"    Thermal     : {result['signals']['thermal']}")
    print(f"    Motion      : {result['signals']['motion']}")
    print(f"    Audio       : {result['signals']['audio']}")

# ── Full detection test ─────────────────────────────────────────────
print("\n" + "=" * 50)
print("  FULL DETECTION WITH SCORER")
print("=" * 50)

survivors = generate_survivors()

test_drones = [
    (1, (10, 10)),
    (2, (33,  7)),
    (3, (25, 25)),
]

for drone_id, pos in test_drones:
    results = detect_survivors(drone_id=drone_id, drone_pos=pos, survivors=survivors)
    print(f"\n  Drone {drone_id} @ {pos}")
    if results:
        for r in results:
            print(f"  [HIT] Survivor {r['survivor_id']} at {r['location']}")
            print(f"        Score={r['confidence']} [{r['label']}]")
            print(f"        Signals → {r['signals']}")
    else:
        print("  No survivors in range.")

print("\n--- Task 2 complete ---")
