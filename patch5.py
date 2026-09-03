import codecs
path = 'simulation/ai_bridge.py'
with codecs.open(path, 'r', 'utf8') as f:
    text = f.read()

import_str = '''import sys
from datetime import datetime
from typing import Any, Dict, List, Tuple

from dead_reckoning import DeadReckoningEngine
dr_engines = {}
'''
text = text.replace('import sys\\nfrom datetime import datetime\\nfrom typing import Any, Dict, List, Tuple\\n', import_str)
text = text.replace('import sys\\r\\nfrom datetime import datetime\\r\\nfrom typing import Any, Dict, List, Tuple\\r\\n', import_str)

old_loop = '''    blackboard = MissionBlackboard(max_entries=800)
    for idx, d in enumerate(drones, start=1):
        gx, gy = world_to_grid(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
        blackboard.post_status(
            idx,
            {
                "position": (gx, gy),
                "battery": float(d.get("battery", 0)),
                "task_id": str(d.get("task", "idle")),
                "zone_id": zone_divider.get_zone((gx, gy)),
                "altitude": float(d.get("z", 0)),
            },
        )'''

new_loop = '''    global dr_engines
    blackboard = MissionBlackboard(max_entries=800)
    for idx, d in enumerate(drones, start=1):
        x_raw = float(d.get("x", 0.0))
        y_raw = float(d.get("y", 0.0))
        gpsMode = d.get("gpsMode", "normal")
        
        if gpsMode == "dead-reckoning":
            drone_id_str = f"DRN-{idx:03d}"
            if drone_id_str not in dr_engines:
                dr_engines[drone_id_str] = DeadReckoningEngine((x_raw, y_raw), float(d.get("heading", 0.0)))
            engine = dr_engines[drone_id_str]
            
            engine.step(0.7, float(d.get("speed", 0.0)), float(d.get("heading", 0.0)))
            COMM_RANGE = 90
            neighbors = []
            for other in alive_drones:
                if other.get("gpsMode", "normal") != "dead-reckoning":
                    ox, oy = float(other.get("x", 0)), float(other.get("y", 0))
                    wx, wy = grid_to_world(world_to_grid(ox, oy)[0], world_to_grid(ox, oy)[1])
                    if ((wx - x_raw)**2 + (wy - y_raw)**2)**0.5 <= COMM_RANGE:
                        neighbors.append((wx, wy))
            if neighbors:
                engine.collaborative_correction(neighbors)
            x_raw, y_raw = engine.estimate.x, engine.estimate.y
            print(f"[{drone_id_str}] Uncertainty: {engine.estimate.uncertainty_radius:.4f}")
        else:
            drone_id_str = f"DRN-{idx:03d}"
            if drone_id_str in dr_engines:
                del dr_engines[drone_id_str]
                
        gx, gy = world_to_grid(x_raw, y_raw)
        blackboard.post_status(
            idx,
            {
                "position": (gx, gy),
                "battery": float(d.get("battery", 0)),
                "task_id": str(d.get("task", "idle")),
                "zone_id": zone_divider.get_zone((gx, gy)),
                "altitude": float(d.get("z", 0)),
            },
        )'''

old_loop_crlf = old_loop.replace('\\n', '\\r\\n')
text = text.replace(old_loop, new_loop)
text = text.replace(old_loop_crlf, new_loop)

fix2_old = '''                "zone_id": zone_divider.get_zone((sx, sy)),
            },
        )'''
fix2_new = '''                "zone_id": zone_divider.get_zone((sx, sy)),
                "detectedAt": surv.get("detectedAt") or surv.get("timestamp"),
            },
        )'''
fix2_old_crlf = fix2_old.replace('\\n', '\\r\\n')
text = text.replace(fix2_old, fix2_new)
text = text.replace(fix2_old_crlf, fix2_new)

with codecs.open(path, 'w', 'utf8') as f:
    f.write(text)
print("Patch 5 applied.")
