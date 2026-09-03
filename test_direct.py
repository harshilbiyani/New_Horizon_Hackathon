from dead_reckoning import DeadReckoningEngine

print("--- WITHOUT CORRECTION ---")
e1 = DeadReckoningEngine((0,0), 0.0)
for i in range(20):
    e1.step(0.7, 10.0, 0.0)
    print(f"[DRN-001] Uncertainty: {e1.estimate.uncertainty:.4f}")

print("\\n--- WITH COLLABORATIVE CORRECTION ---")
e2 = DeadReckoningEngine((0,0), 0.0)
for i in range(20):
    e2.step(0.7, 10.0, 0.0)
    if i % 3 == 0:
        # Every 3 ticks, communicate with an ally
        e2.collaborative_correction([(5, 5)])
    print(f"[DRN-001] Uncertainty: {e2.estimate.uncertainty:.4f}")
