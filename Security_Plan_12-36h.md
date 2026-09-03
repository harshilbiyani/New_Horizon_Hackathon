# DroneShield: 24-Hour Advanced Security Plan (Hours 12-36)

## 1. Problem Statement (PS) Context
Search, rescue, and reconnaissance missions in disaster-affected, forested, or hostile environments demand rapid response and continuous situational awareness. Drones must operate collaboratively with minimal human intervention in environments that are completely GPS-denied and communication-challenged. 
The system must guarantee data integrity and operational security even when conventional infrastructure (cell towers, internet) fails, and when individual drones are captured or jammed.

## 2. Security Gap Analysis
*   **The Cloud Dependency Gap:** Conventional systems fail without internet.
*   **The Hardware Capture Gap:** Software-only credentials can be extracted from crashed drones.
*   **The AI Trust Gap:** Hijacked drones can inject mathematically valid but physically fake data.
*   **The Cloud Media Exposure Gap:** Standard hidden URLs leak sensitive data if intercepted.

---

## 3. The 6-Layer Architecture & Implementation Plan (Hours 12-36)
*Focus: Wiring the 12-hour foundational scripts into the visual UI and wrapping it in a defense-grade master architectural narrative.*

### Layer 1: Hardware-Rooted Identity & Key Isolation
**What it protects:** The drone's cryptographic identity itself — the root of everything else in the stack.
**Why it matters:** Every other layer assumes the drone's identity is trustworthy. Key separation ensures a single leaked key doesn't cascade into a full compromise.
**Gap Solved:** Defeats hardware credential extraction and unauthorized cloning.

**Phase 1 Implementation: Secure Boot Integration**
*   **Objective:** Formally document and integrate the hardware root of trust.
*   **Execution Steps:**
    1.  Write a bash script that demonstrates the **Secure Boot** concept.
    2.  Before initializing the drone's Python payload, the script hashes the `main.py` executable.
    3.  If the hash does not match the pre-approved signature, the bash script aborts launch, visually proving that tampered firmware cannot fly.

### Layer 2: Adaptive Post-Quantum Secure Mesh
**What it protects:** Video and high-volume sensor data moving across the tactical SDR mesh.
**Why it matters:** This layer carries mission-critical video across a contested RF environment. It needs the strongest future-resistant protection against quantum interception.
**Gap Solved:** Defeats SDR interception and "Store-Now-Decrypt-Later" quantum attacks.

**Phase 2 Implementation: Double-Wrap Cascade Routing**
*   **Objective:** Wire the AES-256-GCM and ChaCha20 encryption directly into the mesh routing queues.
*   **Execution Steps:**
    1.  Establish the Hybrid ML-KEM/X25519 Shared Secret upon peer discovery.
    2.  Implement the **Inner Wrap:** Pass the raw JSON payload through `ChaCha20Poly1305.encrypt()`.
    3.  Implement the **Outer Wrap:** Pass the resulting ChaCha ciphertext through `AESGCM.encrypt()`.
    4.  Transmit over the simulated SDR queue and decrypt strictly on the receiving end.

### Layer 3: Resilient Low-Bandwidth Telemetry
**What it protects:** Position and health data over the degraded fallback channel (LoRa).
**Why it matters:** Security here isn't just encryption—it is ensuring that critical data survives when bandwidth is nearly gone. Post-Quantum keys would choke LoRa.
**Gap Solved:** Maintains authenticated critical communication during bandwidth degradation.

**Phase 3 Implementation: Layer 3 Adaptive QoS (Solving the Real Problem)**
*   **Why it's a massive upgrade:** You correctly identified that LoRa bandwidth is tiny. By formally adding Adaptive Priority Queuing (QoS), you prove you understand SWaP (Size, Weight, and Power).
*   **The Fix & Execution:** Showing a dashboard where the drone intentionally drops its own health pings (P4) to make sure a survivor's coordinate (P1) gets through the jammed radio is an incredible feature to demo.
    1.  Classify outgoing JSON packets: `P1_EMERGENCY`, `P2_POSITION`, `P3_HEALTH`, `P4_LOGS`.
    2.  When `current_bandwidth_kbps` drops below a threshold, purge `P4` and `P3` packets.

### Layer 4: Trust-Weighted Swarm Intelligence
**What it protects:** The swarm's collective decision-making from being hijacked by spoofed data.
**Why it matters:** A compromised drone could sign a fake claim ("survivors here"). This layer checks whether the content is *believable*, not just authenticated.
**Gap Solved:** Defeats false-data injection and malicious telemetry.

**Phase 4 Implementation: The Formalization of Layer 4 (The AI Trust Engine)**
*   **Why it's a massive upgrade:** In the first 12 hours, you are just building the "Impossible Speed/Jump" visual anomaly. But in this 12-36 hour phase, formally defining the pipeline (Kalman -> Isolation Forest -> Dempster-Shafer -> BFT) gives your AI a rigorous, academically sound foundation.
*   **The Fix & Execution:** Even if you only implement 30% of this in the actual Python code (e.g., using `scikit-learn` for a basic Isolation Forest on telemetry logs), presenting this full pipeline proves you understand that authentication does not equal truth.
    1.  Train an `IsolationForest` model on a dataset of "normal" drone flight patterns.
    2.  During simulation, feed incoming coordinates into the model's `predict()` function.
    3.  If the model outputs `-1` (Anomaly), reduce the drone's Trust Score. Require a BFT >2/3 Quorum to accept any data from nodes with low trust scores.

### Layer 5: Zero-Trust Admin Gateway & Deception
**What it protects:** The human command interface and cloud-hosted media.
**Why it matters:** Most swarm security stops at the link. This layer builds an active intrusion response directly into the dashboard.
**Gap Solved:** Protects against unauthorized dashboard access and credential abuse.

**Phase 5 Implementation: Layer 5 Active Canary (Closing the Trap)**
*   **Why it's a massive upgrade:** Moving from a passive honeypot to an active intrusion response system is what separates a student project from an enterprise product.
*   **The Fix & Execution:** Wiring your React dashboard to flash a red "TOKEN REVOKED" alert the moment someone pings your fake endpoint is something you can build very quickly in Node.js, and it looks incredible on screen.
    1.  Generate the HMAC-BLAKE3 URLs alongside a visible `SHA-256` decoy string.
    2.  If the backend detects a request attempting to brute-force the SHA-256 string, trigger the Canary.
    3.  The Canary instantly revokes the Admin's JWT and terminates all active media links.

### Layer 6: Offline Field Intelligence & Ground Handoff
**What it protects:** Getting critical intel to human rescuers on the ground with zero network connectivity.
**Why it matters:** Closes the loop on the mission. Finds people when thermal cameras fail and hands data directly to offline rescue teams.
**Gap Solved:** Maintains operational intelligence without centralized infrastructure.

**Phase 6 Implementation: The Brilliant Pivot in Layer 6 (Dropping the Civilian Mesh)**
*   **Why it's a massive upgrade:** The "civilian smartphone mesh" sounded cool on paper, but any defense judge would instantly flag it as a massive security vulnerability (you can't trust random unverified phones with classified thermal maps).
*   **The Fix & Execution:** By pivoting strictly to the Direct Encrypted Ground Handoff, you keep the trust boundary absolutely hermetic. The drone only drops data to a pre-authenticated firefighter's tablet. This is 100% mission-relevant and highly secure.
    1.  Pre-share a static AES-256 "Ground Crew Key" between the drone and a secondary laptop (the firefighter).
    2.  When the drone physically returns to launch (or detects the firefighter's BLE beacon), initiate a local socket connection.
    3.  Encrypt the `thermal_map.png` using AES-256 and push it directly to the firefighter's laptop over the local socket.

---

## 4. Summary of the Hackathon Strategy
You have perfectly aligned the Code Reality with the Pitch Deck Vision:
*   **Hours 0-12:** Build the cryptographic foundations (HKDF, PyNaCl, liboqs, basic anomalies).
*   **Hours 12-36:** Wire those foundations into the visual UI (Dashboard alerts, QoS dropping logs, BLE scanning) and wrap it in this master architectural narrative.
