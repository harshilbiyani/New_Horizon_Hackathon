from urllib.parse import urlparse

class ActiveCanaryTrap:
    """
    Implements Layer 5: Active Defense (Decoy Endpoints / Honeytokens).
    
    This acts as a trap for reconnaissance attacks. If a hacker steals a JWT
    and begins scanning the API infrastructure for vulnerabilities, they will
    inevitably request the highly-enticing decoy endpoint (e.g. /api/admin/master-keys).
    
    When this happens, the trap triggers, instantly blacklisting their token
    and blocking all further access across the entire system.
    """
    
    def __init__(self):
        # The decoy endpoint that legitimate drones will NEVER call
        self.DECOY_ENDPOINT = "/api/admin/master-keys"
        
        # Valid active JWT tokens (Simulated for Hackathon 0-12hr phase)
        self.active_tokens = {
            "jwt_drone_1_valid": "Drone 1",
            "jwt_drone_2_valid": "Drone 2",
            "jwt_hacker_stolen": "Drone 3 (Compromised)"
        }
        
        # Blacklisted tokens that trigger immediate 401 Unauthorized
        self.blacklisted_tokens = set()

    def handle_api_request(self, endpoint: str, jwt_token: str) -> tuple[int, str]:
        """
        Simulates an API Gateway evaluating a request.
        Returns (HTTP_STATUS_CODE, RESPONSE_MESSAGE).
        """
        # 1. Evaluate JWT Authentication
        if jwt_token in self.blacklisted_tokens:
            return 401, "UNAUTHORIZED: Token has been revoked."
            
        if jwt_token not in self.active_tokens:
            return 401, "UNAUTHORIZED: Invalid token."
        
        # 2. Normalize endpoint to defeat bypass attempts:
        #    - Trailing slash:  /api/admin/master-keys/  →  same as /api/admin/master-keys
        #    - Uppercase:       /API/ADMIN/MASTER-KEYS   →  normalized to lowercase
        #    - Query strings:   /api/admin/master-keys?x=1 → path extracted cleanly
        normalized_path = urlparse(endpoint).path.rstrip('/').lower()
        decoy_path = self.DECOY_ENDPOINT.rstrip('/').lower()
            
        # 3. Evaluate Endpoint (The Canary Trap)
        if normalized_path == decoy_path:
            self._trigger_trap(jwt_token)
            return 403, "FORBIDDEN: Intrusion detected. Identity revoked."
            
        # 4. Legitimate Request processing
        if normalized_path.startswith("/api/telemetry"):
            return 200, "OK: Telemetry data processed successfully."
            
        return 404, "NOT FOUND"

    def _trigger_trap(self, jwt_token: str):
        """Executes the Active Defense response."""
        # Remove from active pool and add to permanent blacklist
        if jwt_token in self.active_tokens:
            self.active_tokens.pop(jwt_token)  # discard entity label, no assignment needed
            self.blacklisted_tokens.add(jwt_token)
            # In a real system, this would fire a webhook to Firebase Auth to revoke globally
            
    def get_security_status(self) -> dict:
        """Returns the Canary Trap status for the dashboard UI."""
        return {
            "active_defense": "Canary Decoy API Running",
            "decoy_endpoint": self.DECOY_ENDPOINT,
            "revoked_tokens": len(self.blacklisted_tokens),
            "active_sessions": len(self.active_tokens)
        }
