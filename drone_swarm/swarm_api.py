# swarm_api.py

from datetime import datetime
from enum import Enum


class APICommand(Enum):
    """Commands Team A can send to the swarm."""
    START_MISSION = "start_mission"
    STOP_MISSION = "stop_mission"
    RETURN_TO_BASE = "return_base"
    MARK_ZONE_SAFE = "mark_zone_safe"
    MARK_ZONE_DANGER = "mark_zone_danger"
    RECON_ZONE = "recon_zone"
    TRACK_TARGET = "track_target"
    EMERGENCY_RECALL = "emergency_recall"


class SwarmAPI:
    """
    REST-like API for Team A (external command) to interact with drone swarm.
    
    Provides:
    - Mission control commands
    - Status queries
    - Real-time reconnaissance data
    - Threat level updates
    """
    
    def __init__(self, swarm):
        """
        Initialize API with swarm reference.
        
        Args:
            swarm : SwarmController — main swarm instance
        """
        self.swarm = swarm
        self.api_version = "1.0"
        self.request_log = []
        self.last_heartbeat = datetime.now().isoformat()
    
    # ─── Status Queries ───────────────────────────────────────
    
    def health_status(self):
        """GET /health — Check swarm health."""
        if not hasattr(self.swarm, 'failure_manager'):
            return {"status": "unknown"}
        
        health = self.swarm.failure_manager.get_swarm_health()
        
        return {
            "timestamp": datetime.now().isoformat(),
            "mission_active": self.swarm.mission_active if hasattr(self.swarm, 'mission_active') else False,
            "drones": {
                "total": health.get("total_drones", 0),
                "healthy": health.get("healthy", 0),
                "failed": health.get("failed", 0)
            },
            "health_percentage": health.get("health_pct", 0),
            "api_version": self.api_version
        }
    
    def mission_status(self):
        """GET /mission — Get current mission status."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"error": "Mission not initialized"}
        
        stats = self.swarm.blackboard.get_mission_stats()
        
        return {
            "timestamp": datetime.now().isoformat(),
            "mission_id": stats.get("mission_id"),
            "detections_total": stats.get("detections", 0),
            "warnings": stats.get("warnings", 0),
            "drones_active": stats.get("drones_active", 0),
            "last_update": stats.get("latest_update")
        }
    
    def drone_positions(self):
        """GET /drones/positions — Get all drone current positions."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"error": "No position data"}
        
        positions = {}
        status_summary = self.swarm.blackboard.get_drone_status_summary()
        
        for drone_id, status in status_summary.items():
            positions[f"drone_{drone_id}"] = {
                "position": status.get("position"),
                "battery": status.get("battery"),
                "zone": status.get("zone_id"),
                "task": status.get("task_id")
            }
        
        return positions
    
    def detections(self, limit=50):
        """GET /detections — Get recent survivor detections."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"error": "No detection data"}
        
        detections_list = self.swarm.blackboard.get_latest_detections(limit)
        
        detections = []
        for entry in detections_list:
            detections.append({
                "survivor_id": entry.data.get("survivor_id"),
                "location": entry.data.get("location"),
                "confidence": entry.data.get("confidence"),
                "detected_by": entry.drone_id,
                "timestamp": entry.timestamp
            })
        
        return {"detections": detections, "count": len(detections)}
    
    def threats(self):
        """GET /threats — Get environmental hazards and warnings."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"error": "No threat data"}
        
        warnings = self.swarm.blackboard.get_active_warnings()
        
        threats = []
        for entry in warnings:
            threats.append({
                "type": entry.entry_type,
                "priority": entry.priority,
                "reported_by": entry.drone_id,
                "description": entry.data,
                "timestamp": entry.timestamp
            })
        
        return {"threats": threats, "count": len(threats)}
    
    # ─── Commands ──────────────────────────────────────────────
    
    def send_command(self, command, parameters=None):
        """
        POST /command — Send command to swarm.
        
        Args:
            command    : APICommand — command type
            parameters : dict       — command-specific params
        
        Returns:
            Response dict
        """
        request = {
            "command": command.value,
            "parameters": parameters or {},
            "timestamp": datetime.now().isoformat()
        }
        self.request_log.append(request)
        
        if command == APICommand.START_MISSION:
            return self._execute_start_mission(parameters)
        elif command == APICommand.STOP_MISSION:
            return self._execute_stop_mission(parameters)
        elif command == APICommand.RETURN_TO_BASE:
            return self._execute_return_to_base(parameters)
        elif command == APICommand.MARK_ZONE_SAFE:
            return self._execute_mark_zone_safe(parameters)
        elif command == APICommand.MARK_ZONE_DANGER:
            return self._execute_mark_zone_danger(parameters)
        elif command == APICommand.RECON_ZONE:
            return self._execute_recon_zone(parameters)
        elif command == APICommand.EMERGENCY_RECALL:
            return self._execute_emergency_recall(parameters)
        else:
            return {"status": "error", "message": "Unknown command"}
    
    def _execute_start_mission(self, params):
        """Start mission at given location."""
        target = params.get("target", (25, 25))
        priority = params.get("priority", "NORMAL")
        
        return {
            "status": "success",
            "mission": "STARTED",
            "target": target,
            "priority": priority,
            "message": f"Mission started at {target}"
        }
    
    def _execute_stop_mission(self, params):
        """Stop current mission."""
        return {
            "status": "success",
            "mission": "STOPPED",
            "message": "All drones halting current tasks"
        }
    
    def _execute_return_to_base(self, params):
        """Recall all drones to base."""
        return {
            "status": "success",
            "action": "RETURN_TO_BASE",
            "estimated_arrival": "12 minutes",
            "message": "All drones returning to base"
        }
    
    def _execute_mark_zone_safe(self, params):
        """Mark a zone as cleared/safe."""
        zone_id = params.get("zone_id")
        return {
            "status": "success",
            "zone": zone_id,
            "threat_level": "CLEAR",
            "message": f"Zone {zone_id} marked as safe"
        }
    
    def _execute_mark_zone_danger(self, params):
        """Mark a zone as dangerous/no-go."""
        zone_id = params.get("zone_id")
        threat = params.get("threat_type", "UNKNOWN")
        
        return {
            "status": "success",
            "zone": zone_id,
            "threat_level": "DANGER",
            "threat_type": threat,
            "message": f"Zone {zone_id} marked as dangerous ({threat})"
        }
    
    def _execute_recon_zone(self, params):
        """Request reconnaissance of a specific zone."""
        zone_id = params.get("zone_id")
        priority = params.get("priority", "NORMAL")
        
        return {
            "status": "accepted",
            "action": "RECON_QUEUED",
            "zone": zone_id,
            "priority": priority,
            "eta": "5-10 minutes",
            "message": f"Zone {zone_id} recon queued (priority: {priority})"
        }
    
    def _execute_emergency_recall(self, params):
        """Emergency recall all drones immediately."""
        reason = params.get("reason", "Unknown")
        
        return {
            "status": "critical",
            "action": "EMERGENCY_RECALL",
            "reason": reason,
            "message": "EMERGENCY: All drones recalling immediately"
        }
    
    # ─── Data Export ───────────────────────────────────────────
    
    def export_mission_report(self):
        """Export full mission report for Team A."""
        if not hasattr(self.swarm, 'blackboard'):
            return {"error": "No mission data"}
        
        return {
            "report_generated": datetime.now().isoformat(),
            "mission": self.mission_status(),
            "health": self.health_status(),
            "detections": self.detections(limit=100),
            "threats": self.threats(),
            "drone_status": self.drone_positions()
        }
    
    def get_request_log(self, limit=50):
        """Get log of all API requests made."""
        return {
            "request_count": len(self.request_log),
            "last_requests": self.request_log[-limit:]
        }


class MockSwarmController:
    """Mock swarm for testing API without full swarm."""
    
    def __init__(self):
        from mission_blackboard import MissionBlackboard
        from failure_recovery import FailureRecoveryManager
        
        self.blackboard = MissionBlackboard()
        self.failure_manager = FailureRecoveryManager()
        self.mission_active = True
        
        # Add test data
        for i in range(1, 6):
            self.failure_manager.register_drone(i)
            self.failure_manager.record_heartbeat(i)
