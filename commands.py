from enum import Enum
from dataclasses import dataclass
from typing import Optional, Tuple

class CommandType(Enum):
    HOLD = "HOLD"
    GOTO = "GOTO"
    TAKEOFF = "TAKEOFF"
    LAND = "LAND"
    SEARCH = "SEARCH"
    RETURN_HOME = "RETURN_HOME"
    AVOID = "AVOID"

@dataclass
class AutonomyCommand:
    type: CommandType
    target_position: Optional[Tuple[float, float, float]] = None # (lat, lon, alt)
    velocity: Optional[Tuple[float, float, float]] = None
    priority: int = 0
    reason: str = ""
