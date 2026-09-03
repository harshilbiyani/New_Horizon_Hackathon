import unittest
import jwt
from crypto_canary import ActiveCanaryTrap

class TestLayer5Canary(unittest.TestCase):
    
    def setUp(self):
        self.gateway = ActiveCanaryTrap()
        self.legit_token = jwt.encode({"sub": "drone_1"}, self.gateway.JWT_SECRET, algorithm="HS256")
        self.hacker_token = jwt.encode({"sub": "hacker_1"}, self.gateway.JWT_SECRET, algorithm="HS256")
        
    def test_legitimate_api_request(self):
        """Test that a normal drone can access normal APIs."""
        status, msg = self.gateway.handle_api_request("/api/telemetry/update", self.legit_token)
        self.assertEqual(status, 200, "Legitimate request was blocked!")
        self.assertIn("drone_1", self.gateway.active_sessions)

    def test_canary_trap_activation(self):
        """CRITICAL SECURITY TEST: Test that touching the decoy endpoint revokes the token."""
        # 1. Hacker tries to access the decoy endpoint
        status, msg = self.gateway.handle_api_request("/api/admin/master-keys", self.hacker_token)
        self.assertEqual(status, 403, "Canary Trap failed to block the intrusion!")
        
        # 2. Verify token was moved to blacklist
        self.assertNotIn("hacker_1", self.gateway.active_sessions)
        self.assertIn(self.hacker_token, self.gateway.blacklisted_tokens)
        
        # 3. Hacker tries to access a normal endpoint now that they are blacklisted
        status_after, msg_after = self.gateway.handle_api_request("/api/telemetry/update", self.hacker_token)
        self.assertEqual(status_after, 401, "SECURITY FAILURE: Revoked token was still able to access normal APIs!")

if __name__ == '__main__':
    unittest.main()
