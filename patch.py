import codecs

def patch():
    path = 'drone_swarm/mission_blackboard.py'
    with codecs.open(path, 'r', 'latin1') as f:
        text = f.read()

    text = text.replace('def __init__(self, drone_id, entry_type, data, priority=1, ttl=300):', 'def __init__(self, drone_id, entry_type, data, priority=1, ttl=300, timestamp=None):')
    text = text.replace('self.timestamp = datetime.now().isoformat()', 'self.timestamp = timestamp if timestamp else datetime.now().isoformat()')

    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        if 'def post_detection(self, drone_id, detection_info):' in line:
            out.append('        ts = detection_info.get("detectedAt", None)')
            
        if 'drone_id=drone_id,' in line and i+1 < len(lines) and 'entry_type="DETECTION",' in lines[i+1]:
            out.append(lines[i+1])
            out.append('            timestamp=ts,')
            i += 1
        i += 1
    
    with codecs.open(path, 'w', 'latin1') as f:
        f.write('\n'.join(out))

    path2 = 'simulation/ai_bridge.py'
    with codecs.open(path2, 'r', 'latin1') as f:
        text2 = f.read()
    
    old_tgt = '"zone_id": zone_divider.get_zone((sx, sy))'
    new_tgt = '"zone_id": zone_divider.get_zone((sx, sy)),\n                "detectedAt": surv.get("detectedAt") or surv.get("timestamp")'
    text2 = text2.replace(old_tgt, new_tgt)
    
    with codecs.open(path2, 'w', 'latin1') as f:
        f.write(text2)

patch()
print("done")
