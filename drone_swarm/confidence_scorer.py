# confidence_scorer.py

import random
import math


def get_proximity_signal(dist, radius):
    """
    Proximity signal: 1.0 when on top of survivor, 0.0 at edge of radius.
    This is the most reliable signal — no randomness.
    """
    if dist > radius:
        return 0.0
    return round(1.0 - (dist / radius), 4)


def get_thermal_signal(dist, radius, seed=None):
    """
    Simulated thermal camera reading.
    Closer = higher base heat signature, but with sensor noise.
    In a real drone: IR camera pixel intensity near body temperature (37°C).
    """
    if seed is not None:
        random.seed(seed)

    base = max(0, 1.0 - (dist / radius))
    noise = random.uniform(-0.15, 0.15)        # sensor noise
    signal = max(0.0, min(1.0, base + noise))  # clamp to [0, 1]
    return round(signal, 4)


def get_motion_signal(dist, radius, seed=None):
    """
    Simulated motion detector reading.
    Survivors may be unconscious (low motion) — so this is weighted less.
    Real drones use optical flow or PIR sensors.
    """
    if seed is not None:
        random.seed(seed)

    if dist > radius:
        return 0.0

    # Unconscious survivors still show subtle movement (breathing ~0.2 baseline)
    base = random.uniform(0.2, 0.85) * max(0, 1.0 - (dist / radius))
    return round(base, 4)


def get_audio_signal(dist, radius, seed=None):
    """
    Simulated microphone/audio signal.
    Very short range only (half the detection radius).
    Real drones use directional mics to pick up calls or heartbeats.
    """
    if seed is not None:
        random.seed(seed)

    audio_radius = radius * 0.5
    if dist > audio_radius:
        return 0.0  # out of audio range

    base = max(0, 1.0 - (dist / audio_radius))
    noise = random.uniform(-0.1, 0.1)
    signal = max(0.0, min(1.0, base + noise))
    return round(signal, 4)


def compute_confidence(dist, radius, drone_id=None):
    """
    Master confidence scorer — combines all 4 signals into one score.

    Weights (must sum to 1.0):
        proximity : 0.40  (most reliable — physics-based)
        thermal   : 0.30  (reliable — heat is hard to fake)
        motion    : 0.15  (less reliable — survivor may be unconscious)
        audio     : 0.15  (short range only — high value when triggered)

    Returns a detailed dict so the dashboard can show each signal.
    """
    seed = drone_id  # makes scores reproducible per drone

    proximity = get_proximity_signal(dist, radius)
    thermal   = get_thermal_signal(dist, radius, seed=seed)
    motion    = get_motion_signal(dist, radius, seed=(seed + 1 if seed else None))
    audio     = get_audio_signal(dist, radius, seed=(seed + 2 if seed else None))

    # Weighted combination
    final_score = (
        0.40 * proximity +
        0.30 * thermal   +
        0.15 * motion    +
        0.15 * audio
    )
    final_score = round(min(1.0, final_score), 4)

    # Human-readable confidence label
    if final_score >= 0.75:
        label = "HIGH"
    elif final_score >= 0.45:
        label = "MEDIUM"
    elif final_score > 0.0:
        label = "LOW"
    else:
        label = "NONE"

    return {
        "final_score" : final_score,
        "label"       : label,
        "signals"     : {
            "proximity" : proximity,
            "thermal"   : thermal,
            "motion"    : motion,
            "audio"     : audio
        }
    }
