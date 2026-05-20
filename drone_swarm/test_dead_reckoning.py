# test_dead_reckoning.py

from dead_reckoning import DeadReckoningEngine, LocalizationEstimate, IndoorPositioningAid

print("=" * 70)
print("  PHASE 3 TASK 9 — GPS-DENIED DEAD RECKONING")
print("=" * 70)

# Initialize drone with dead reckoning engine
print("\n" + "=" * 70)
print("  SCENARIO: INDOOR FOREST WITH NO GPS")
print("=" * 70)

# True position (known to us for validation)
true_position = (10.0, 10.0)
true_heading = 0.0

# Drone's estimate (starts correct but will drift)
dr_engine = DeadReckoningEngine(true_position, true_heading)

print(f"\nDrone starts at estimated: {dr_engine.estimate.to_dict()}")

print("\n" + "=" * 70)
print("  PHASE 1: IMU INTEGRATION (NO CORRECTIONS)")
print("=" * 70)

# Simulate 10 steps of acceleration (e.g., drone moving forward)
print("\nMoving forward with constant acceleration (0.5 m/s²):")

true_x, true_y = true_position
for step in range(10):
    # Simulate forward acceleration (x-direction)
    acceleration = (0.5, 0.0)  # 0.5 m/s² forward
    
    dr_engine.integrate_imu(acceleration, dt=1.0)
    
    # Simulate true movement
    true_x += 0.5 * 0.5 * 1.0**2 + 0.5 * 1.0  # kinematic equation
    true_y += 0.0
    
    if step % 3 == 0:
        error = dr_engine.estimate.distance_to(LocalizationEstimate(true_x, true_y, 0))
        print(f"  Step {step:2d}: Est {dr_engine.estimate.to_tuple()}, "
              f"True {(true_x, true_y)}, Error: {error:.2f}m, "
              f"Uncertainty: {dr_engine.estimate.uncertainty:.2f}m")

print(f"\n⚠️  After 10 steps:")
print(f"  Est position:    {dr_engine.estimate.to_dict()}")
print(f"  True position:   ({true_x:.2f}, {true_y:.2f})")
print(f"  Error distance:  {dr_engine.estimate.distance_to(LocalizationEstimate(true_x, true_y, 0)):.2f}m")

print("\n" + "=" * 70)
print("  PHASE 2: COMPASS CORRECTION")
print("=" * 70)

print("\nApplying compass update...")
dr_engine.update_heading(compass_reading=45.0, angular_velocity=5.0)
print(f"Heading corrected: {dr_engine.estimate.to_dict()['heading']}°")

print("\n" + "=" * 70)
print("  PHASE 3: LANDMARK OBSERVATION(Rescue Beacon)")
print("=" * 70)

# Observe a known landmark
landmark_pos = (25.0, 10.0)  # Rescue beacon location
print(f"\nObserving rescue beacon at {landmark_pos}...")

correction = dr_engine.observe_landmark(landmark_pos, observation_noise=0.5)
print(f"  True distance to beacon: {correction['true_distance']}m")
print(f"  Measured distance:       {correction['measured_distance']}m")
print(f"  Applied correction:      {correction['correction'] * 100:.0f}%")
print(f"\nAfter landmark correction:")
print(f"  Est position:     {dr_engine.estimate.to_dict()}")
print(f"  Uncertainty:      {dr_engine.estimate.uncertainty:.2f}m")

print("\n" + "=" * 70)
print("  PHASE 4: COLLABORATIVE LOCALIZATION")
print("=" * 70)

# Drone 2 sent its position via mesh network
ally_estimate = LocalizationEstimate(22.0, 12.0, 90.0, uncertainty_radius=2.0)
print(f"\nDrone 2 reports its position: {ally_estimate.to_dict()}")

# We observe drone 2 relative to us
dx, dy, confidence = 12.0, 2.0, 0.85  # relative observation with high confidence

print(f"We observe Drone 2 at relative position: ({dx}, {dy}), confidence: {confidence}")

dr_engine.fuse_ally_position(2, ally_estimate, (dx, dy, confidence))
print(f"\nAfter collaborative fusion:")
print(f"  Est position: {dr_engine.estimate.to_dict()}")

print("\n" + "=" * 70)
print("  PHASE 5: WIFI TRILATERATION")
print("=" * 70)

# Setup WiFi beacons (e.g., base stations)
indoor_pos = IndoorPositioningAid()
indoor_pos.register_beacon("base_a", (0.0, 0.0))
indoor_pos.register_beacon("base_b", (50.0, 0.0))
indoor_pos.register_beacon("base_c", (25.0, 43.0))

print(f"\nWiFi beacons registered:")
for bid, pos in indoor_pos.wifi_beacons.items():
    print(f"  {bid}: {pos}")

# Simulate RSSI readings (signal strength)
rssi_readings = {
    "base_a": -50,  # strong signal (close)
    "base_b": -75,  # weak signal (far)
    "base_c": -60   # medium signal
}

print(f"\nReceived RSSI readings: {rssi_readings}")

trilaterated_pos = indoor_pos.triangulate_from_rssi(rssi_readings)
print(f"Trilaterated position: ({trilaterated_pos[0]:.2f}, {trilaterated_pos[1]:.2f})")

print("\n" + "=" * 70)
print("  LOCALIZATION CONFIDENCE REGIONS")
print("=" * 70)

print(f"\nCurrent position estimate:")
print(f"  Point: ({dr_engine.estimate.x:.2f}, {dr_engine.estimate.y:.2f})")
print(f"  Heading: {dr_engine.estimate.heading:.1f}°")
print(f"  Uncertainty circle: radius = {dr_engine.estimate.uncertainty:.2f}m")

ellipse = dr_engine.get_covariance_ellipse()
print(f"\nConfidence regions:")
print(f"  68% confidence (1σ): radius {ellipse['radius']:.2f}m")
print(f"  95% confidence (2σ): radius {ellipse['confidence_95']:.2f}m")

# Visual representation
print(f"\n  Confidence circle:")
radius = int(ellipse['radius'])
for y in range(-radius, radius + 1):
    line = ""
    for x in range(-radius, radius + 1):
        dist = (x**2 + y**2)**0.5
        if dist <= radius:
            line += "●"
        else:
            line += " "
    if y == 0:
        line = line.replace("●", "*", 1)
    print(f"  {line}")

print("\n" + "=" * 70)
print("  SUMMARY: GPS-DENIED LOCALIZATION COMPLETE")
print("=" * 70)

print(f"""
Techniques used:
  ✓ IMU integration (accelerometer → position)
  ✓ Compass heading maintenance
  ✓ Landmark observation correction
  ✓ Collaborative localization (from ally drones)
  ✓ WiFi trilateration (indoor positioning aid)

Final estimate:
  Position: {dr_engine.estimate.to_dict()}
  Uncertainty: {dr_engine.estimate.uncertainty:.2f}m

Quality: GOOD (multiple correction sources)
""")

print("--- Task 9 complete ---")
