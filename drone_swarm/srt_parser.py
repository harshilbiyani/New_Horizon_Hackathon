"""
srt_parser.py — Parse DJI drone SRT subtitle files to extract per-frame GPS metadata.

DJI SRT format (example block):
    1
    00:00:00,000 --> 00:00:00,033
    <font size="28">SrtCnt : 1, DiffTime : 33ms
    2024-01-15 14:32:01.123
    [iso : 100] [shutter : 1/1000] [fnum : 280] [ev : 0] [ct : 5500] [color_md : default] [focal_len : 240] [dzoom_ratio: 10000, delta:0], [latitude: 12.971598] [longitude: 77.594566] [rel_alt: 45.200 abs_alt: 922.800] </font>

Usage:
    from drone_swarm.srt_parser import SRTParser
    parser = SRTParser("path/to/video.SRT")
    meta = parser.get_frame_meta(frame_number=42, fps=30)
    # Returns: {lat, lon, altitude_m, heading_deg, timestamp}
"""

import re
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger("srt_parser")


@dataclass
class FrameMeta:
    lat: float = 0.0
    lon: float = 0.0
    altitude_m: float = 0.0
    heading_deg: float = 0.0
    timestamp: str = ""
    iso: Optional[int] = None
    shutter: Optional[str] = None


@dataclass
class SRTBlock:
    index: int
    start_ms: int
    end_ms: int
    meta: FrameMeta


# ─── Regex patterns for DJI SRT ──────────────────────────────────────────────
_RE_LAT = re.compile(r'\[latitude\s*:\s*([+-]?\d+\.\d+)\]', re.I)
_RE_LON = re.compile(r'\[longitude\s*:\s*([+-]?\d+\.\d+)\]', re.I)
_RE_REL_ALT = re.compile(r'\[rel_alt\s*:\s*([+-]?\d+\.\d+)', re.I)
_RE_ISO = re.compile(r'\[iso\s*:\s*(\d+)\]', re.I)
_RE_SHUTTER = re.compile(r'\[shutter\s*:\s*([^\]]+)\]', re.I)
_RE_HEADING = re.compile(r'\[(?:heading|yaw)\s*:\s*([+-]?\d+\.?\d*)\]', re.I)
_RE_TS = re.compile(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)')
_RE_TC = re.compile(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})')


def _tc_to_ms(h, m, s, ms) -> int:
    return int(h) * 3_600_000 + int(m) * 60_000 + int(s) * 1_000 + int(ms)


def _parse_block(lines: list[str], index: int) -> Optional[SRTBlock]:
    """Parse a single SRT block (3+ lines) into an SRTBlock."""
    text = "\n".join(lines)
    # Find timecode line
    tc_match = _RE_TC.search(text)
    if not tc_match:
        return None
    start_ms = _tc_to_ms(*tc_match.groups()[:4])
    end_ms = _tc_to_ms(*tc_match.groups()[4:])

    meta = FrameMeta()
    if m := _RE_LAT.search(text):
        meta.lat = float(m.group(1))
    if m := _RE_LON.search(text):
        meta.lon = float(m.group(1))
    if m := _RE_REL_ALT.search(text):
        meta.altitude_m = float(m.group(1))
    if m := _RE_HEADING.search(text):
        meta.heading_deg = float(m.group(1))
    if m := _RE_TS.search(text):
        meta.timestamp = m.group(1).replace(" ", "T") + "Z"
    if m := _RE_ISO.search(text):
        meta.iso = int(m.group(1))
    if m := _RE_SHUTTER.search(text):
        meta.shutter = m.group(1).strip()

    return SRTBlock(index=index, start_ms=start_ms, end_ms=end_ms, meta=meta)


class SRTParser:
    """
    Parses a DJI SRT file and provides per-frame metadata lookup.
    """

    def __init__(self, srt_path: str | Path):
        self.srt_path = Path(srt_path)
        self._blocks: list[SRTBlock] = []
        self._load()

    def _load(self):
        if not self.srt_path.exists():
            log.warning(f"SRT file not found: {self.srt_path}")
            return
        try:
            text = self.srt_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            log.error(f"Failed to read SRT: {e}")
            return

        # Split into blocks by blank lines
        raw_blocks = re.split(r'\n\s*\n', text.strip())
        for i, raw in enumerate(raw_blocks):
            lines = [l.strip() for l in raw.splitlines() if l.strip()]
            if not lines:
                continue
            block = _parse_block(lines, i)
            if block:
                self._blocks.append(block)

        log.info(f"Parsed {len(self._blocks)} SRT blocks from {self.srt_path.name}")

    @property
    def block_count(self) -> int:
        return len(self._blocks)

    def get_meta_at_ms(self, ms: int) -> FrameMeta:
        """Return the FrameMeta for the given video position in milliseconds."""
        if not self._blocks:
            return FrameMeta()
        # Binary search for the block whose time window contains ms
        lo, hi = 0, len(self._blocks) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if self._blocks[mid].end_ms < ms:
                lo = mid + 1
            else:
                hi = mid
        return self._blocks[lo].meta

    def get_frame_meta(self, frame_number: int, fps: float = 30.0) -> FrameMeta:
        """Return FrameMeta for a given frame number at the given FPS."""
        ms = int((frame_number / fps) * 1000)
        return self.get_meta_at_ms(ms)

    def to_list(self) -> list[dict]:
        """Export all blocks as a list of dicts."""
        return [
            {
                "index": b.index,
                "start_ms": b.start_ms,
                "end_ms": b.end_ms,
                "lat": b.meta.lat,
                "lon": b.meta.lon,
                "altitude_m": b.meta.altitude_m,
                "heading_deg": b.meta.heading_deg,
                "timestamp": b.meta.timestamp,
            }
            for b in self._blocks
        ]


def synthetic_gps_walk(
    frame_idx: int,
    total_frames: int,
    lat_center: float = 12.9716,
    lon_center: float = 77.5946,
    radius: float = 0.008,
) -> tuple[float, float, float, float]:
    """
    Generate a smooth simulated GPS flight path (circle) when no SRT is available.
    Returns (lat, lon, altitude_m, heading_deg).
    """
    import math
    angle = (frame_idx / max(total_frames, 1)) * 2 * math.pi
    lat = lat_center + radius * math.sin(angle)
    lon = lon_center + radius * math.cos(angle)
    # Altitude oscillates 40–80m
    alt = 60 + 20 * math.sin(angle * 3)
    heading = (math.degrees(angle) + 90) % 360
    return round(lat, 6), round(lon, 6), round(alt, 1), round(heading, 1)
