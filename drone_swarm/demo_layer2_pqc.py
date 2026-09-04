import time
from crypto_hybrid_kem import HybridKEMNode
import hashlib

def print_separator():
    print("-" * 75)

def run_demo():
    print("\n" + "=" * 75)
    print(" LAYER 2: HYBRID POST-QUANTUM KEY ENCAPSULATION MECHANISM (KEM) DEMO")
    print("=" * 75)
    
    print("\n[SCENARIO] Drone Alpha is establishing a secure mesh link with Drone Bravo.")
    print("Goal: Defeat 'Store-Now-Decrypt-Later' attacks using NIST's ML-KEM-768.\n")
    time.sleep(1.5)
    
    # 1. Initialize
    print("[1] Initializing Cryptographic Nodes...")
    drone_alpha = HybridKEMNode(node_id=1)
    drone_bravo = HybridKEMNode(node_id=2)
    time.sleep(1)
    
    # 2. Public Key Exchange
    print_separator()
    print("[2] Drone Alpha transmits Public Key Bundle to Drone Bravo")
    bundle_alpha = drone_alpha.get_public_bundle()
    print(f"  |-- Classical X25519 Pub Key: {len(bundle_alpha['x25519_pub'])} bytes")
    print(f"  |-- Quantum ML-KEM-768 Pub Key: {len(bundle_alpha['ml_kem_pub'])} bytes (Structurally accurate FIPS 203)")
    time.sleep(1.5)
    
    # 3. Encapsulation
    print_separator()
    print("[3] Drone Bravo performs Hybrid Encapsulation...")
    bundle_bravo, secret_bravo = drone_bravo.encapsulate_to_peer(bundle_alpha)
    print(f"  |-- Generating Classical X25519 Shared Secret...")
    print(f"  |-- Generating Quantum ML-KEM-768 Ciphertext: {len(bundle_bravo['ml_kem_ciphertext'])} bytes")
    print(f"  |-- Fusing Secrets via HKDF-SHA256...")
    print(f"  => Bravo Hybrid Session Key: [ {hashlib.sha256(secret_bravo).hexdigest()[:32]}... ]")
    time.sleep(1.5)
    
    # 4. Decapsulation
    print_separator()
    print("[4] Drone Alpha receives Ciphertext Bundle and performs Decapsulation...")
    secret_alpha = drone_alpha.decapsulate_from_peer(bundle_bravo)
    print(f"  |-- Reconstructing Classical Shared Secret...")
    print(f"  |-- Decapsulating ML-KEM-768 Ciphertext...")
    print(f"  |-- Fusing Secrets via HKDF-SHA256...")
    print(f"  => Alpha Hybrid Session Key: [ {hashlib.sha256(secret_alpha).hexdigest()[:32]}... ]")
    time.sleep(1.5)
    
    # 5. Verification
    print_separator()
    print("[5] Verifying Hybrid Cryptographic Tunnel")
    if secret_alpha == secret_bravo:
        print("\n  [SUCCESS] Hybrid Secrets perfectly match!")
        print("  [STATUS]  Mesh Link is now secured with AES-256-CBC wrapped in Quantum/Classical Keys.")
    else:
        print("\n  [FAILED] Secrets do not match. Intrusion detected.")
        
    print("=" * 75 + "\n")

if __name__ == "__main__":
    run_demo()
