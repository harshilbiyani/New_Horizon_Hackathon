import codecs

path = 'simulation/ai_bridge.py'
with codecs.open(path, 'r', 'utf8') as f:
    text = f.read()

lines = text.split('\n')
out = []
i = 0
while i < len(lines):
    l = lines[i]
    if l.startswith("from typing import Any"):
        out.append(l)
        out.append("")
        out.append("from dead_reckoning import DeadReckoningEngine")
        out.append("dr_engines = {}")
        i += 1
        continue
    
    if "gx, gy = world_to_grid(float(d.get(\"x\", 0.0)), float(d.get(\"y\", 0.0)))" in l and "import" not in l and i > 150:
        # We are at line 165ish
        inj = """        x_raw = float(d.get("x", 0.0))
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
                    wx, wy = ox, oy
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
                
        gx, gy = world_to_grid(x_raw, y_raw)"""
        for x in inj.split('\n'): out.append(x)
        i += 1
        continue
        
    out.append(l)
    i += 1

with codecs.open(path, 'w', 'utf8') as f:
    f.write('\n'.join(out))
