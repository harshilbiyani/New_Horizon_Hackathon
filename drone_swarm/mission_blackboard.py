# mission_blackboard.py

from datetime import datetime
from typing import Dict, List


class BlackboardEntry:
    """Single entry on the shared blackboard."""
    
    def __init__(self, drone_id, entry_type, data, priority="NORMAL"):
        """
        Create a blackboard entry.
        
        Args:
            drone_id    : int    — which drone posted this
            entry_type  : str    — type: STATUS, DETECTION, WARNING, ALERT, DISCOVERY
            data        : dict   — entry content
            priority    : str    — NORMAL, URGENT, CRITICAL
        """
        self.drone_id = drone_id
        self.entry_type = entry_type
        self.data = data
        self.priority = priority
        self.timestamp = datetime.now().isoformat()
        self.ttl = 60  # time to live in seconds (auto-expire)
    
    def is_expired(self):
        """Check if entry has expired based on TTL."""
        from datetime import datetime, timedelta
        posted = datetime.fromisoformat(self.timestamp)
        age_seconds = (datetime.now() - posted).total_seconds()
        return age_seconds > self.ttl
    
    def to_dict(self):
        return {
            "drone_id": self.drone_id,
            "type": self.entry_type,
            "priority": self.priority,
            "timestamp": self.timestamp,
            "data": self.data
        }


class MissionBlackboard:
    """
    Shared communication blackboard for the drone swarm.
    
    All drones write their state, detections, and alerts here.
    Acts as a decentralized mission control board.
    """
    
    def __init__(self, max_entries=1000):
        """Initialize the blackboard."""
        self.entries: List[BlackboardEntry] = []
        self.max_entries = max_entries
        self.mission_id = f"MISSION_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    def post_status(self, drone_id, status_info):
        """
        Drone posts its status (position, battery, task, etc).
        
        Args:
            drone_id     : int    — which drone
            status_info  : dict   — {position, battery, task_id, zone_id, ...}
        """
        entry = BlackboardEntry(
            drone_id=drone_id,
            entry_type="STATUS",
            data=status_info,
            priority="NORMAL"
        )
        self.entries.append(entry)
        self._cleanup()
    
    def post_detection(self, drone_id, detection_info):
        """
        Drone posts a survivor detection.
        
        Args:
            drone_id        : int  — which drone found it
            detection_info  : dict — {survivor_id, location, confidence, signals, ...}
        """
        entry = BlackboardEntry(
            drone_id=drone_id,
            entry_type="DETECTION",
            data=detection_info,
            priority="URGENT"  # detections are high priority
        )
        self.entries.append(entry)
        self._cleanup()
    
    def post_warning(self, drone_id, warning_info):
        """
        Drone posts a warning (obstacle, threat, environmental hazard).
        
        Args:
            drone_id      : int  — which drone detected it
            warning_info  : dict — {type, location, severity, recommendation, ...}
        """
        entry = BlackboardEntry(
            drone_id=drone_id,
            entry_type="WARNING",
            data=warning_info,
            priority="URGENT"
        )
        self.entries.append(entry)
        self._cleanup()
    
    def post_discovery(self, drone_id, discovery_info):
        """
        Drone posts a discovery (new resource, path, zone characterization).
        
        Args:
            drone_id        : int  — which drone
            discovery_info  : dict — {type, data, zone_id, ...}
        """
        entry = BlackboardEntry(
            drone_id=drone_id,
            entry_type="DISCOVERY",
            data=discovery_info,
            priority="NORMAL"
        )
        self.entries.append(entry)
        self._cleanup()
    
    def post_alert(self, drone_id, alert_info):
        """
        Drone posts a critical alert (failure, emergency, malfunction).
        
        Args:
            drone_id   : int  — which drone
            alert_info : dict — {alert_type, severity, action_required, ...}
        """
        entry = BlackboardEntry(
            drone_id=drone_id,
            entry_type="ALERT",
            data=alert_info,
            priority="CRITICAL"
        )
        self.entries.append(entry)
        self._cleanup()
    
    def get_entries(self, entry_type=None, drone_id=None, priority=None):
        """
        Query blackboard entries (non-expired only).
        
        Args:
            entry_type : str — filter by type (None = all)
            drone_id   : int — filter by drone (None = all)
            priority   : str — filter by priority level
        
        Returns:
            Filtered list of entries
        """
        results = []
        
        for entry in self.entries:
            # Skip expired entries
            if entry.is_expired():
                continue
            
            # Apply filters
            if entry_type and entry.entry_type != entry_type:
                continue
            if drone_id is not None and entry.drone_id != drone_id:
                continue
            if priority and entry.priority != priority:
                continue
            
            results.append(entry)
        
        return results
    
    def get_latest_detections(self, limit=50):
        """Get most recent survivor detections."""
        detections = self.get_entries(entry_type="DETECTION")
        detections.sort(key=lambda e: e.timestamp, reverse=True)
        return detections[:limit]
    
    def get_active_warnings(self):
        """Get all current warnings and alerts."""
        warnings = self.get_entries(entry_type="WARNING")
        alerts = self.get_entries(entry_type="ALERT")
        return sorted(warnings + alerts, 
                     key=lambda e: (e.priority != "CRITICAL", e.timestamp),
                     reverse=True)
    
    def get_drone_status_summary(self):
        """Get latest status for each drone."""
        summary = {}
        
        # Get latest STATUS entry for each drone
        for entry in sorted(self.get_entries(entry_type="STATUS"), 
                           key=lambda e: e.timestamp, reverse=True):
            if entry.drone_id not in summary:
                summary[entry.drone_id] = entry.data
        
        return summary
    
    def get_zone_intelligence(self, zone_id):
        """
        Compile all intelligence about a zone from blackboard.
        
        Returns:
            Dict with detections, discoveries, warnings in that zone
        """
        intelligence = {
            "zone_id": zone_id,
            "detections": [],
            "discoveries": [],
            "warnings": [],
            "last_update": None
        }
        
        for entry in self.get_entries():
            if entry.entry_type == "DETECTION":
                if entry.data.get("zone_id") == zone_id:
                    intelligence["detections"].append(entry.to_dict())
            elif entry.entry_type == "DISCOVERY":
                if entry.data.get("zone_id") == zone_id:
                    intelligence["discoveries"].append(entry.to_dict())
            elif entry.entry_type == "WARNING":
                if entry.data.get("zone_id") == zone_id:
                    intelligence["warnings"].append(entry.to_dict())
            
            intelligence["last_update"] = max(
                intelligence["last_update"] or entry.timestamp,
                entry.timestamp
            )
        
        return intelligence
    
    def get_mission_stats(self):
        """Get aggregate mission statistics from blackboard."""
        entries = self.get_entries()
        
        return {
            "mission_id": self.mission_id,
            "total_entries": len(self.entries),
            "active_entries": len(entries),
            "detections": len(self.get_entries(entry_type="DETECTION")),
            "warnings": len(self.get_entries(entry_type="WARNING")),
            "alerts": len(self.get_entries(entry_type="ALERT")),
            "drones_active": len(set(e.drone_id for e in self.get_entries(entry_type="STATUS"))),
            "latest_update": max([e.timestamp for e in entries]) if entries else None
        }
    
    def _cleanup(self):
        """Remove expired entries and enforce max size."""
        # Remove expired
        self.entries = [e for e in self.entries if not e.is_expired()]
        
        # Enforce max size (keep most recent)
        if len(self.entries) > self.max_entries:
            self.entries.sort(key=lambda e: e.timestamp)
            self.entries = self.entries[-self.max_entries:]
    
    def clear(self):
        """Clear all entries (use with caution)."""
        self.entries = []
    
    def export_summary(self):
        """Export a human-readable summary of blackboard state."""
        stats = self.get_mission_stats()
        
        summary = f"""
╔══════════════════════════════════════════════════════════════╗
║                   MISSION BLACKBOARD REPORT                  ║
╚══════════════════════════════════════════════════════════════╝

Mission:          {stats['mission_id']}
Total Entries:    {stats['total_entries']} (Active: {stats['active_entries']})
Active Drones:    {stats['drones_active']}

Detections:       {stats['detections']}
Warnings:         {stats['warnings']}
Alerts:           {stats['alerts']}

Last Update:      {stats['latest_update']}

Top Priorities (Urgent/Critical):
"""
        for entry in self.get_active_warnings()[:5]:
            summary += f"\n  ⚠️  Drone {entry.drone_id} — {entry.data.get('type', 'Unknown')}"
        
        return summary
