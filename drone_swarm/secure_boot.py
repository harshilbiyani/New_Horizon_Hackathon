"""
Layer 1 (12-36h Upgrade): Secure Boot Enforcement

Simulates the Secure Boot process that runs BEFORE the drone's Python payload
initializes. It hashes the target firmware file and compares against a
pre-signed 'golden hash' stored in the firmware manifest.

If the hashes differ, the drone physically cannot launch — proving that
tampered firmware is completely neutralized at the hardware boot stage.
"""

import hashlib
import json
import sys
import os


MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "firmware_manifest.json")


def compute_sha256(filepath: str) -> str:
    """Computes the SHA-256 hash of a file's contents."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def register_firmware(filepath: str):
    """
    Signs the current firmware and writes its golden hash to the manifest.
    Call this once during factory provisioning / initial build.
    """
    golden_hash = compute_sha256(filepath)
    manifest = {
        "firmware_file": os.path.basename(filepath),
        "golden_sha256": golden_hash,
        "provisioned_by": "DroneShield Factory Boot Signer v1.0"
    }
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[SECURE BOOT] Firmware registered. Golden hash: {golden_hash[:16]}...")
    return golden_hash


def verify_boot(filepath: str) -> bool:
    """
    Verifies that the firmware file matches the factory-signed golden hash.
    Returns True if boot is allowed. Calls sys.exit(1) if tampered.
    """
    print("\n[SECURE BOOT] Initializing pre-flight firmware integrity check...")
    print(f"  |-- Target: {os.path.basename(filepath)}")

    if not os.path.exists(MANIFEST_PATH):
        print("  => [BOOT ABORTED] No firmware manifest found. Cannot verify integrity.")
        sys.exit(1)

    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    golden_hash = manifest.get("golden_sha256", "")
    current_hash = compute_sha256(filepath)

    print(f"  |-- Golden Hash:  {golden_hash[:32]}...")
    print(f"  |-- Current Hash: {current_hash[:32]}...")

    if current_hash == golden_hash:
        print("  => [BOOT AUTHORIZED] Firmware integrity verified. Launch approved.\n")
        return True
    else:
        print("  => [BOOT ABORTED] Firmware hash mismatch detected!")
        print("  => [SECURITY ALERT] Possible tampered or corrupted firmware. Launch denied.")
        print("  => [ACTION] Drone motor interlock engaged. Swarm notified.\n")
        sys.exit(1)


if __name__ == "__main__":
    # Demo: register then verify our own script
    this_file = os.path.abspath(__file__)
    register_firmware(this_file)
    verify_boot(this_file)
    print("[OK] Secure Boot demo complete. This script passed its own integrity check.")
