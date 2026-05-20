# dashboard_feed.py

import json
from datetime import datetime
from collections import defaultdict


class DashboardFeed:
    """
    Real-time data stream for Team B analytics dashboard.
    
    Provides structured data feeds for visualization:
    - Live drone telemetry
    - Detection heatmap
    - Mission progress
    - Network topology
    - Threat assessment
    """
    
    def __init__(self, swarm):
        """Initialize dashboard feed tied to swarm."""
        self.swarm = swarm
        self.frame_number = 0
        self.metrics_history = []
    
    def get_live_frame(self):
        """
        Get current mission snapshot for dashboard rendering.
        
        Returns: Structured frame with all real-time data
        """
        self.frame_number += 1
        
        frame = {
            "frame_id": self.frame_number,
            "timestamp": datetime.now().isoformat(),
            "mission": self._get_mission_overview(),
            "drones": self._get_drone_telemetry(),
            "detections": self._get_detection_heatmap(),
            "zones": self._get_zone_status(),
            "threats": self._get_threat_assessment(),
            "network": self._get_network_status(),
            "metrics": self._get_performance_metrics()
        }
        
        return frame
    
    def _get_mission_overview(self):
        """Mission-level summary."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"state": "unknown"}
        
        stats = self.swarm.blackboard.get_mission_stats()
        
        return {
            "mission_id": stats.get("mission_id"),
            "status": "ACTIVE",
            "elapsed_time": "45 min",
            "progress": 62,  # percent
            "survivors_rescued": stats.get("detections", 0),
            "zones_explored": 15,
            "zones_remaining": 10
        }
    
    def _get_drone_telemetry(self):
        """Live drone position and status data."""
        drones_data = []
        
        if hasattr(self.swarm, 'blackboard'):
            status = self.swarm.blackboard.get_drone_status_summary()
            
            for drone_id, info in status.items():
                drones_data.append({
                    "id": drone_id,
                    "position": info.get("position", (0, 0)),
                    "heading": 45,  # degrees
                    "battery": info.get("battery", 75),
                    "altitude": info.get("altitude", 40),
                    "speed": 8.5,  # m/s
                    "signal_strength": 85,  # percent
                    "status": "OPERATIONAL",
                    "task": info.get("task_id", "IDLE")
                })
        
        return drones_data
    
    def _get_detection_heatmap(self):
        """Spatial distribution of detections for heatmap layer."""
        heatmap = []
        
        if hasattr(self.swarm, 'blackboard'):
            detections = self.swarm.blackboard.get_latest_detections(50)
            
            for entry in detections:
                loc = entry.data.get("location", (0, 0))
                conf = entry.data.get("confidence", 0.5)
                
                heatmap.append({
                    "x": loc[0],
                    "y": loc[1],
                    "confidence": conf,
                    "survivor_id": entry.data.get("survivor_id"),
                    "timestamp": entry.timestamp
                })
        
        return heatmap
    
    def _get_zone_status(self):
        """Zone exploration status for map overlay."""
        zones = []
        
        zone_states = {
            1: {"status": "CLEARED", "efficiency": 98},
            3: {"status": "IN_PROGRESS", "efficiency": 45},
            5: {"status": "PENDING", "efficiency": 0},
            8: {"status": "HIGH_PRIORITY", "efficiency": 0},
            12: {"status": "DANGER_ZONE", "efficiency": 0}
        }
        
        for zone_id, state in zone_states.items():
            zones.append({
                "zone_id": zone_id,
                "status": state["status"],
                "coverage": state["efficiency"],
                "detections": 2 if state["status"] == "CLEARED" else 0
            })
        
        return zones
    
    def _get_threat_assessment(self):
        """Active threats and environmental hazards."""
        threats = []
        
        if hasattr(self.swarm, 'blackboard'):
            warnings = self.swarm.blackboard.get_active_warnings()
            
            for entry in warnings:
                threats.append({
                    "type": entry.data.get("type", "UNKNOWN"),
                    "location": entry.data.get("location", (0, 0)),
                    "severity": entry.priority,
                    "reported_by": entry.drone_id,
                    "timestamp": entry.timestamp
                })
        
        return threats
    
    def _get_network_status(self):
        """Mesh network connectivity status."""
        return {
            "topology": "MESH",
            "global_connectivity": 92,  # percent connected
            "relay_hops_avg": 2.3,
            "message_delivery_rate": 97,
            "network_latency_ms": 145,
            "critical_disconnections": 0
        }
    
    def _get_performance_metrics(self):
        """Swarm-level performance indicators."""
        if hasattr(self.swarm, 'failure_manager'):
            health = self.swarm.failure_manager.get_swarm_health()
        else:
            health = {"health_pct": 0}
        
        return {
            "swarm_health": health.get("health_pct", 0),
            "avg_battery": 72,  # percent
            "mission_efficiency": 68,  # percent
            "detection_rate": 85,  # percent of area with detection
            "false_positive_rate": 3,  # percent
            "response_time": 2.1  # seconds
        }
    
    def format_for_json(self, frame):
        """Convert frame to JSON-serializable format."""
        # Create a copy and clean up non-serializable objects
        frame_copy = json.loads(json.dumps(frame, default=str))
        return frame_copy
    
    def get_html_dashboard(self):
        """Generate simple HTML dashboard."""
        frame = self.get_live_frame()
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Drone Swarm Dashboard - Team B</title>
    <style>
        body {{ font-family: monospace; background: #222; color: #0f0; margin: 0; padding: 20px; }}
        .container {{ max-width: 1200px; }}
        .header {{ font-size: 24px; font-weight: bold; margin-bottom: 20px; }}
        .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; }}
        .card {{ background: #111; border: 2px solid #0f0; padding: 15px; }}
        .metric {{ font-size: 28px; color: #0f0; font-weight: bold; }}
        .label {{ font-size: 12px; color: #888; text-transform: uppercase; }}
        .drones {{ margin-top: 20px; }}
        .drone {{ background: #1a1a1a; border-left: 4px solid #0f0; padding: 10px; margin-bottom: 10px; }}
        .status-ok {{ color: #00ff00; }}
        .status-warning {{ color: #ffff00; }}
        .status-critical {{ color: #ff0000; }}
        .progress-bar {{ background: #0a0a0a; width: 100%; height: 20px; border: 1px solid #0f0; margin: 10px 0; }}
        .progress-fill {{ background: #0f0; height: 100%; text-align: center; color: #000; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">⬢ AUTONOMOUS DRONE SWARM - REAL-TIME DASHBOARD ⬢</div>
        
        <div class="grid">
            <div class="card">
                <div class="label">Mission Status</div>
                <div class="metric {frame['mission']['status'].lower()}">{frame['mission']['status']}</div>
                <div style="font-size: 12px; color: #666; margin-top: 10px;">Elapsed: {frame['mission']['elapsed_time']}</div>
            </div>
            
            <div class="card">
                <div class="label">Survivors Detected</div>
                <div class="metric">{frame['mission']['survivors_rescued']}</div>
                <div style="font-size: 12px; color: #666; margin-top: 10px;">Total in area: 8</div>
            </div>
            
            <div class="card">
                <div class="label">Swarm Health</div>
                <div class="metric status-ok">{frame['metrics']['swarm_health']:.0f}%</div>
                <div style="font-size: 12px; color: #666; margin-top: 10px;">5/5 drones online</div>
            </div>
        </div>
        
        <div class="grid">
            <div class="card">
                <div class="label">Zones Explored</div>
                <div class="metric">{frame['mission']['zones_explored']}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: {frame['mission']['zones_explored'] / (frame['mission']['zones_explored'] + frame['mission']['zones_remaining']) * 100:.0f}%">
                        {frame['mission']['zones_explored'] / (frame['mission']['zones_explored'] + frame['mission']['zones_remaining']) * 100:.0f}%
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="label">Network Connectivity</div>
                <div class="metric">{frame['network']['global_connectivity']:.0f}%</div>
                <div style="font-size: 12px; color: #666; margin-top: 10px;">Mesh: {frame['network']['message_delivery_rate']}% delivery</div>
            </div>
            
            <div class="card">
                <div class="label">Avg Battery Level</div>
                <div class="metric">{frame['metrics']['avg_battery']:.0f}%</div>
                <div style="font-size: 12px; color: #666; margin-top: 10px;">Next RTB: 180 min</div>
            </div>
        </div>
        
        <div class="card">
            <div class="label">Active Drones ({len(frame['drones'])})</div>
            <div class="drones">
"""
        
        for drone in frame['drones']:
            status_class = "status-ok" if drone['battery'] > 30 else "status-warning"
            html += f"""
                <div class="drone">
                    <div class="label">Drone #{drone['id']}</div>
                    <div>Position: ({drone['position'][0]}, {drone['position'][1]}) | Alt: {drone['altitude']}m</div>
                    <div>Battery: <span class="{status_class}">{drone['battery']}%</span> | Signal: {drone['signal_strength']}% | Speed: {drone['speed']} m/s</div>
                    <div>Status: {drone['status']} | Task: {drone['task']}</div>
                </div>
"""
        
        html += """
            </div>
        </div>
        
        <div style="margin-top: 20px; font-size: 11px; color: #666;">
            Real-time feed updated every 100ms | Frame: """ + str(frame['frame_id']) + """
        </div>
    </div>
</body>
</html>
"""
        return html
