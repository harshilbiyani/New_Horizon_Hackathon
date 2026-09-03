import codecs
path = 'drone_swarm/mission_blackboard.py'
with codecs.open(path, 'r', 'latin1') as f:
    text = f.read()

import_str = """
        import json, os
        try:
            cfg = os.path.join(os.path.dirname(__file__), "..", "shared", "simConfig.json")
            with open(cfg, "r") as f:
                self.ttl = json.load(f).get("DETECTION_TTL", 60)
        except:
            self.ttl = 60
"""

text = text.replace("self.ttl = 60  # time to live in seconds (auto-expire)", import_str)
with codecs.open(path, 'w', 'latin1') as f:
    f.write(text)
