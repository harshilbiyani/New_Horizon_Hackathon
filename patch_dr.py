import codecs

inj = """
    def step(self, dt, speed, heading):
        dx = speed * math.cos(math.radians(heading))
        dy = speed * math.sin(math.radians(heading))
        vx, vy = self.velocity
        ax = (dx - vx) / dt if dt > 0 else 0
        ay = (dy - vy) / dt if dt > 0 else 0
        self.integrate_imu((ax, ay), dt)
        self.update_heading(heading, (heading - self.estimate.heading)/dt if dt > 0 else 0)

    def collaborative_correction(self, neighbor_positions):
        for px, py in neighbor_positions:
            ally_est = LocalizationEstimate(px, py, 0, 0.5)
            dx = ally_est.x - self.estimate.x
            dy = ally_est.y - self.estimate.y
            self.fuse_ally_position(id(ally_est), ally_est, (dx, dy, 0.8))
"""

with codecs.open('drone_swarm/dead_reckoning.py', 'r', 'latin1') as f:
    text = f.read()

# Insert before IndoorPositioningAid if it exists
if "class IndoorPositioningAid" in text:
    text = text.replace("class IndoorPositioningAid", inj + "\\n\\nclass IndoorPositioningAid")
else:
    text += "\\n" + inj

with codecs.open('drone_swarm/dead_reckoning.py', 'w', 'latin1') as f:
    f.write(text)

print("dead_reckoning.py patched.")
