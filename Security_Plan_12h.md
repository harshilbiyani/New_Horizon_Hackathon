# DroneShield: 12-Hour Core Security Plan (Hours 0-12)

## 1. Problem Statement (PS) Context
Search, rescue, and reconnaissance missions in disaster-affected, forested, or hostile environments demand rapid response and continuous situational awareness. Drones must operate collaboratively with minimal human intervention in environments that are completely GPS-denied and communication-challenged. 
The system must guarantee data integrity and operational security even when conventional infrastructure (cell towers, internet) fails, and when individual drones are captured or jammed.

## 2. Security Gap Analysis
*   **The Cloud Dependency Gap:** Conventional systems fail without internet.
*   **The Hardware Capture Gap:** Software-only credentials can be extracted from crashed drones.
*   **The AI Trust Gap:** Hijacked drones can inject mathematically valid but physically fake data.
*   **The Cloud Media Exposure Gap:** Standard hidden URLs leak sensitive data if intercepted.

---

## 3. The 6-Layer Architecture & Implementation Plan (Hours 0-12)
*Focus: Building the cryptographic foundations and basic anomalies for a live hackathon demo.*

### Layer 1: Hardware-Rooted Identity & Key Isolation
**What it protects:** The drone's cryptographic identity itself — the root of everything else in the stack.
**Why it matters:** Every other layer assumes the drone's identity is trustworthy. Key separation ensures a single leaked key doesn't cascade into a full compromise.
**Gap Solved:** Defeats hardware credential extraction and unauthorized cloning.

**Phase 1 Implementation: Identity/Keys (HKDF vs PUF)**
*   **Why it's brilliant for 12 hours:** You can't code a real hardware PUF on a Jetson in 12 hours. But implementing HKDF in Python takes 10 lines of code using the standard cryptography library. It mathematically proves you understand key separation.
*   **Execution Steps:**
    1.  Define a static 32-byte `simulated_puf_seed` to mock the hardware root.
    2.  Use `HKDF(algorithm=hashes.SHA256(), length=32, info=b"payload_encryption")` to derive the `K_payload` key.
    3.  Use `HKDF(algorithm=hashes.SHA256(), length=32, info=b"transport_encryption")` to derive the `K_transport` key.
    4.  Print both keys to the console in the demo to visually prove complete cryptographic isolation from the single root.

### Layer 2: Adaptive Post-Quantum Secure Mesh
**What it protects:** Video and high-volume sensor data moving across the tactical SDR mesh.
**Why it matters:** This layer carries mission-critical video across a contested RF environment. It needs the strongest future-resistant protection against quantum interception.
**Gap Solved:** Defeats SDR interception and "Store-Now-Decrypt-Later" quantum attacks.

**Phase 2 Implementation: SDR Crypto (liboqs vs Full Mesh)**
*   **Why it's brilliant for 12 hours:** Writing a real mesh routing protocol takes weeks. But demonstrating a Hybrid Quantum Handshake? You can use `liboqs-python` (Open Quantum Safe). The judges will see real Quantum Key Encapsulation (ML-KEM) running in your terminal. That alone will drop jaws.
*   **Execution Steps:**
    1.  Install dependencies: `pip install liboqs-python cryptography`.
    2.  Generate a classical X25519 keypair.
    3.  Initialize the Post-Quantum KEM using `oqs.KeyEncapsulation('ML-KEM-768')`.
    4.  Perform the ML-KEM encapsulation to generate the PQ shared secret.
    5.  XOR the classical X25519 shared secret with the ML-KEM shared secret to finalize the Hybrid Session Key.

### Layer 3: Resilient Low-Bandwidth Telemetry
**What it protects:** Position and health data over the degraded fallback channel (LoRa).
**Why it matters:** Security here isn't just encryption—it is ensuring that critical data survives when bandwidth is nearly gone. Post-Quantum keys would choke LoRa.
**Gap Solved:** Maintains authenticated critical communication during bandwidth degradation.

**Phase 3 Implementation: Telemetry (PyNaCl vs Real LoRa)**
*   **Why it's brilliant for 12 hours:** Hardware integration always breaks during live demos. By simulating the LoRa network in Python and using `PyNaCl` (Networking and Cryptography library) for Ed25519 signatures, you guarantee a flawless software demo of the encryption without fighting radio antennas.
*   **Execution Steps:**
    1.  Install dependency: `pip install pynacl`.
    2.  Generate an Ed25519 `SigningKey` for each simulated drone.
    3.  Intercept the outgoing JSON telemetry packet and sign the serialized bytes.
    4.  The receiver validates the signature using the `VerifyKey`. Invalid packets are instantly dropped.

### Layer 4: Trust-Weighted Swarm Intelligence
**What it protects:** The swarm's collective decision-making from being hijacked by spoofed data.
**Why it matters:** A compromised drone could sign a fake claim ("survivors here"). This layer checks whether the content is *believable*, not just authenticated.
**Gap Solved:** Defeats false-data injection and malicious telemetry.

**Phase 4 Implementation: Swarm AI (Simple Anomaly vs Full Stack)**
*   **Why it's brilliant for 12 hours:** Building Dempster-Shafer fusion takes a PhD. Building a rule that says "If a drone moves faster than 100km/h, turn it red on the dashboard and ignore its data" takes 15 minutes. It perfectly visually simulates the "Quarantine" concept for the judges.
*   **Execution Steps:**
    1.  Store the last known `(x, y)` coordinate and timestamp for every drone in `mesh_network.py`.
    2.  Calculate the speed delta of incoming packets.
    3.  If speed exceeds the physical limit (>100 km/h), flag the data as **"IMPOSSIBLE_JUMP"**.
    4.  Send a WebSocket alert to the React dashboard to instantly turn that drone's icon RED (Quarantined).

### Layer 5: Zero-Trust Admin Gateway & Deception
**What it protects:** The human command interface and cloud-hosted media.
**Why it matters:** Most swarm security stops at the link. This layer builds an active intrusion response directly into the dashboard.
**Gap Solved:** Protects against unauthorized dashboard access and credential abuse.

**Phase 5 Implementation: Deception (Simple Canary vs Cloudinary Chain)**
*   **Why it's brilliant for 12 hours:** The 5-step Cloudinary loop is complex to wire up. But a fake API endpoint (e.g., `/api/admin/secret-keys`) that instantly revokes the user's JWT and flashes a red "INTRUSION DETECTED" alert on your React dashboard? That takes an hour to build and has 10x the visual wow-factor for the judges.
*   **Execution Steps:**
    1.  Require a valid Firebase JWT for all `/api/admin/*` routes in Node.js.
    2.  Create a highly enticing decoy endpoint: `/api/admin/master-keys`.
    3.  If an attacker hits this endpoint, instantly invalidate their JWT, log their IP, and flash the massive red alert on the UI.

### Layer 6: Offline Field Intelligence & Ground Handoff
**What it protects:** Getting critical intel to human rescuers on the ground with zero network connectivity.
**Why it matters:** Closes the loop on the mission. Finds people when thermal cameras fail and hands data directly to offline rescue teams.
**Gap Solved:** Maintains operational intelligence without centralized infrastructure.

**Phase 6 Implementation: Ground Truth (BLE Sniffing)**
*   **Why it's brilliant for 12 hours:** Using the Python `bleak` library to scan for your own smartphone's Bluetooth MAC address, and making the UI say "Survivor Device Detected," is the ultimate live physical demo.
*   **Execution Steps:**
    1.  Install `pip install bleak`.
    2.  Write an async loop using `BleakScanner.discover()` to scan for MAC addresses.
    3.  Filter for high signal strength (RSSI > -60).
    4.  Broadcast a JSON payload to the dashboard: `{"type": "SURVIVOR_BLE_DETECTED"}` when your smartphone's Bluetooth is detected.
