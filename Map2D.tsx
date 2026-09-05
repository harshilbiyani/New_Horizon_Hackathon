import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const defaultCenter: [number, number] = [-35.363261, 149.165230];

// Helper: Convert simulation physical offset (x meters, y meters) to (Lat, Lon)
function simToLatLon(x: number, y: number, centerLat: number = -35.363261, centerLon: number = 149.165230): [number, number] {
  const deltaLat = y / 111320;
  const deltaLon = x / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return [centerLat + deltaLat, centerLon + deltaLon];
}

// 🟢 GREEN DRONE DOT ICON
const createGreenDroneIcon = (heading: number = 0, label: string = '') => {
  const svg = `
    <div style="position: relative; text-align: center; width: 36px; height: 36px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" style="transform: rotate(${heading}deg); filter: drop-shadow(0px 0px 8px #00ff00);">
        <circle cx="18" cy="18" r="12" fill="#00ff00" fill-opacity="0.3" stroke="#00ff00" stroke-width="1.5" />
        <circle cx="18" cy="18" r="7" fill="#00ff00" stroke="#ffffff" stroke-width="2" />
        <polygon points="18,3 23,14 18,11 13,14" fill="#003300" />
      </svg>
      ${
        label
          ? `<div style="font-size: 9px; font-weight: 900; color: #00ff00; background: rgba(0,10,0,0.9); padding: 1px 5px; border-radius: 4px; display: inline-block; white-space: nowrap; margin-top: -6px; border: 1px solid #00ff00;">${label}</div>`
          : ''
      }
    </div>
  `;
  return L.divIcon({
    className: 'green-drone-icon',
    html: svg,
    iconSize: [36, 44],
    iconAnchor: [18, 18],
  });
};

// 🔴 RED PERSON / SURVIVOR DOT ICON
const createRedPersonIcon = (label: string = 'PERSON') => {
  const svg = `
    <div style="position: relative; text-align: center; width: 28px; height: 28px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" style="filter: drop-shadow(0px 0px 10px #ff0055);">
        <circle cx="14" cy="14" r="11" fill="#ff0055" fill-opacity="0.35" stroke="#ff0055" stroke-width="1.5" />
        <circle cx="14" cy="14" r="6" fill="#ff0044" stroke="#ffffff" stroke-width="1.8" />
      </svg>
      <div style="font-size: 8px; font-weight: 900; color: #ffffff; background: rgba(180,0,50,0.9); padding: 1px 3px; border-radius: 3px; display: inline-block; white-space: nowrap; margin-top: -8px; border: 1px solid #ff0055;">
        ${label}
      </div>
    </div>
  `;
  return L.divIcon({
    className: 'red-person-icon',
    html: svg,
    iconSize: [28, 34],
    iconAnchor: [14, 14],
  });
};

// 🟠 ORANGE OBSTACLE DOT ICON
const createOrangeObstacleIcon = (label: string = 'OBSTACLE') => {
  const svg = `
    <div style="position: relative; text-align: center; width: 26px; height: 26px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="26" height="26" style="filter: drop-shadow(0px 0px 8px #ff9900);">
        <polygon points="13,2 24,22 2,22" fill="#ff9900" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.5" />
        <text x="13" y="19" font-size="10" font-weight="900" fill="#000000" text-anchor="middle">!</text>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'orange-obstacle-icon',
    html: svg,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Home Base Icon
const createHomeIcon = () => {
  const svg = `
    <div style="background: #00e676; color: #000; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(0,230,118,0.8);">
      H
    </div>
  `;
  return L.divIcon({
    className: 'custom-home-icon',
    html: svg,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

interface SitlDrone {
  id: string;
  lat?: number;
  lon?: number;
  x?: number;
  y?: number;
  alt?: number;
  heading?: number;
  battery?: number;
  status?: string;
  task?: string;
}

interface Map2DProps {
  sitlDrones?: SitlDrone[];
}

// Calculate endpoint given start point, distance in meters, and bearing in degrees
function getEndpoint(lat: number, lon: number, distanceM: number, bearingDeg: number): [number, number] {
  const R = 6371000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const deg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = rad(lat);
  const lon1 = rad(lon);
  const brng = rad(bearingDeg);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
      Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(brng)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceM / R) * Math.cos(lat1),
      Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [deg(lat2), deg(lon2)];
}

// Generate sector polygon points for Search Regions
function createSectorPolygon(
  centerLat: number,
  centerLon: number,
  rInnerM: number,
  rOuterM: number,
  startDeg: number,
  endDeg: number,
  steps: number = 12
): [number, number][] {
  const points: [number, number][] = [];
  const stepAngle = (endDeg - startDeg) / steps;

  for (let i = 0; i <= steps; i++) {
    const angle = startDeg + i * stepAngle;
    points.push(getEndpoint(centerLat, centerLon, rOuterM, angle));
  }

  if (rInnerM > 0) {
    for (let i = steps; i >= 0; i--) {
      const angle = startDeg + i * stepAngle;
      points.push(getEndpoint(centerLat, centerLon, rInnerM, angle));
    }
  } else {
    points.push([centerLat, centerLon]);
  }

  return points;
}

const RecenterMap = ({ target }: { target: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    if (target && target[0] !== 0 && target[1] !== 0) {
      map.panTo(target, { animate: true, duration: 0.5 });
    }
  }, [target, map]);
  return null;
};

export default function Map2D({ sitlDrones }: Map2DProps) {
  const [telemetryDrones, setTelemetryDrones] = useState<SitlDrone[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [obstacles, setObstacles] = useState<any[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string>('ALL');
  const [isEnlarged, setIsEnlarged] = useState(false);

  // Sector regions mapping each drone to its divided area of search
  const searchRegions = [
    { id: 'DRN-001', label: 'Sector 1 (North-East)', color: '#00ffcc', poly: createSectorPolygon(defaultCenter[0], defaultCenter[1], 0, 800, 0, 90) },
    { id: 'DRN-002', label: 'Sector 2 (North-West)', color: '#38bdf8', poly: createSectorPolygon(defaultCenter[0], defaultCenter[1], 0, 800, 270, 360) },
    { id: 'DRN-003', label: 'Sector 3 (South-West)', color: '#ff0055', poly: createSectorPolygon(defaultCenter[0], defaultCenter[1], 0, 800, 180, 270) },
    { id: 'DRN-004', label: 'Sector 4 (South-East)', color: '#10b981', poly: createSectorPolygon(defaultCenter[0], defaultCenter[1], 0, 800, 90, 180) },
    { id: 'DRN-005', label: 'Sector 5 (Center Patrol)', color: '#a855f7', poly: createSectorPolygon(defaultCenter[0], defaultCenter[1], 0, 400, 0, 360, 24) },
  ];

  // Poll live telemetry snapshot from server
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/mission/snapshot');
        if (res.ok) {
          const data = await res.json();
          if (data.drones && data.drones.length > 0) {
            setTelemetryDrones(data.drones);
          }
          if (data.hiddenSurvivors) {
            setPeople(data.hiddenSurvivors);
          }
          if (data.obstacles) {
            setObstacles(data.obstacles);
          }
        }
      } catch (e) {
        console.warn('Map2D telemetry fetch fallback:', e);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 300); // 300ms smooth polling
    return () => clearInterval(interval);
  }, []);

  // Merge prop sitlDrones with telemetryDrones
  const activeDrones: SitlDrone[] = telemetryDrones.length > 0 ? telemetryDrones : (sitlDrones || []);

  // Fallback default scattered people if server snapshot empty
  const defaultPeople = [
    { id: 'PERSON-1', x: 120, y: 180, severity: 'critical' },
    { id: 'PERSON-2', x: -140, y: 210, severity: 'stable' },
    { id: 'PERSON-3', x: 230, y: -160, severity: 'critical' },
    { id: 'PERSON-4', x: -190, y: -220, severity: 'stable' },
    { id: 'PERSON-5', x: 45, y: -80, severity: 'unknown' },
  ];
  const displayPeople = people.length > 0 ? people : defaultPeople;

  // Fallback default scattered obstacles if server snapshot empty
  const defaultObstacles = [
    { id: 'OBS-1', x: 80, y: 120, severity: 'high' },
    { id: 'OBS-2', x: -90, y: 140, severity: 'medium' },
    { id: 'OBS-3', x: 150, y: -110, severity: 'high' },
    { id: 'OBS-4', x: -130, y: -150, severity: 'medium' },
  ];
  const displayObstacles = obstacles.length > 0 ? obstacles : defaultObstacles;

  // Compute map center focus drone
  const activeTargetDrone = activeDrones.find(d => d.id === selectedDroneId) || activeDrones[0];
  const focusLatLon: [number, number] = activeTargetDrone && (activeTargetDrone.lat || activeTargetDrone.x !== undefined)
    ? (activeTargetDrone.lat && activeTargetDrone.lon
        ? [activeTargetDrone.lat, activeTargetDrone.lon]
        : simToLatLon(activeTargetDrone.x || 0, activeTargetDrone.y || 0))
    : defaultCenter;

  const renderLeafletMap = (isModalView: boolean) => (
    <div className={`w-full relative overflow-hidden bg-[#000814] ${isModalView ? 'h-[calc(100vh-140px)] rounded-xl border border-white/10' : 'h-full'}`}>
      {/* Map Header Overlay Bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex justify-between items-center bg-[#0a0e1a]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-[#00ffcc] tracking-wider uppercase text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse"></span> 2D ArduPilot Sector Map
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Target Drone Selector Floating Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-gray-400">TARGET:</span>
            <select
              value={selectedDroneId}
              onChange={(e) => setSelectedDroneId(e.target.value)}
              className="bg-[#020714] text-[#00ffcc] font-bold border border-white/15 rounded-lg px-2.5 py-1 outline-none text-xs"
            >
              <option value="ALL">🌐 ALL DRONES (5 Active)</option>
              {activeDrones.map((d, i) => {
                const id = d.id || `DRN-00${i + 1}`;
                return (
                  <option key={id} value={id}>
                    🛸 {id}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Enlarge View Toggle Button */}
          <button
            onClick={() => setIsEnlarged(!isEnlarged)}
            className="bg-[#00ffcc] text-black font-extrabold px-3 py-1 rounded-lg text-[11px] hover:bg-cyan-300 transition shadow-[0_0_10px_rgba(0,255,204,0.4)] cursor-pointer"
          >
            {isEnlarged ? '✕ CLOSE' : '⤢ ENLARGE VIEW'}
          </button>
        </div>
      </div>

      {/* Map Legend Overlay — ONLY rendered in enlarged modal view as requested */}
      {isModalView && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-[#0a0e1a]/90 backdrop-blur-md border border-white/15 p-3.5 rounded-xl shadow-2xl text-xs text-white flex flex-col gap-2">
          <div className="font-extrabold text-[#00ffcc] text-[11px] uppercase tracking-wider border-b border-white/10 pb-1">
            2D Swarm Map Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
            <span className="font-bold text-gray-200">🟢 Drones (Green Dots - Moving in Sectors)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff0055] shadow-[0_0_8px_#ff0055]" />
            <span className="font-bold text-gray-200">🔴 People / Survivors (Red Dots)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff9900] shadow-[0_0_8px_#ff9900]" />
            <span className="font-bold text-gray-200">🟠 Obstacles (Orange Dots - Hazards)</span>
          </div>
        </div>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={16}
        style={{ width: '100%', height: '100%', background: '#000814' }}
      >
        <TileLayer
          attribution="&copy; Esri World Imagery"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <RecenterMap target={focusLatLon} />

        {/* Divided Sector Search Polygons */}
        {searchRegions.map((region) => {
          const isSelected = selectedDroneId === region.id || selectedDroneId === 'ALL';
          if (!isSelected) return null;
          return (
            <Polygon
              key={region.id}
              positions={region.poly}
              pathOptions={{
                color: region.color,
                fillColor: region.color,
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '4, 4',
              }}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong>{region.label}</strong>
                  <br />
                  Assigned Drone: {region.id}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Central Launch Pad Marker */}
        <Marker position={defaultCenter} icon={createHomeIcon()}>
          <Popup>
            <div className="text-xs">
              <strong>Central Launch Pad (0,0)</strong>
              <br />
              All drones start & RTB from here
            </div>
          </Popup>
        </Marker>

        {/* 🟢 GREEN DRONE DOTS (Hovering & Moving to Allocated Zones) */}
        {activeDrones.map((drone, idx) => {
          const droneId = drone.id || `DRN-00${idx + 1}`;
          const pos: [number, number] =
            drone.lat && drone.lon
              ? [drone.lat, drone.lon]
              : simToLatLon(drone.x || 0, drone.y || 0);

          return (
            <Marker
              key={`drone-${droneId}`}
              position={pos}
              icon={createGreenDroneIcon(drone.heading || 0, droneId)}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong className="text-emerald-400">{droneId} (Active Swarm)</strong>
                  <br />
                  Status: {drone.status || 'Active Hovering'}
                  <br />
                  Task: {drone.task || 'Sector Sweep'}
                  <br />
                  Battery: {drone.battery || 100}%
                  <br />
                  Pos: [{pos[0].toFixed(5)}, {pos[1].toFixed(5)}]
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 🔴 RED PEOPLE / SURVIVOR DOTS (Scattered Across Map) */}
        {displayPeople.map((person, idx) => {
          const pos: [number, number] =
            person.lat && person.lon
              ? [person.lat, person.lon]
              : simToLatLon(person.x || 0, person.y || 0);

          const personId = person.id || `SURV-${idx + 1}`;
          return (
            <Marker
              key={`person-${personId}`}
              position={pos}
              icon={createRedPersonIcon(`PERSON ${idx + 1}`)}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong className="text-rose-500">👤 {personId} (Survivor)</strong>
                  <br />
                  Severity: {person.severity || 'Critical'}
                  <br />
                  Target Position: [{pos[0].toFixed(5)}, {pos[1].toFixed(5)}]
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 🟠 ORANGE OBSTACLE DOTS (Scattered Across Map) */}
        {displayObstacles.slice(0, 15).map((obs, idx) => {
          const pos: [number, number] =
            obs.lat && obs.lon
              ? [obs.lat, obs.lon]
              : simToLatLon(obs.x || 0, obs.y || 0);

          const obsId = obs.id || `OBS-${idx + 1}`;
          return (
            <Marker
              key={`obs-${obsId}`}
              position={pos}
              icon={createOrangeObstacleIcon(`HAZARD ${idx + 1}`)}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong className="text-amber-500">⚠️ {obsId} (Obstacle Hazard)</strong>
                  <br />
                  Severity: {obs.severity || 'High'}
                  <br />
                  Structure Position: [{pos[0].toFixed(5)}, {pos[1].toFixed(5)}]
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#000814]">
      {renderLeafletMap(false)}

      {/* Full-Screen Enlarged Modal View for 2D Map */}
      {isEnlarged && (
        <div className="fixed inset-0 z-[9999] bg-[#000814]/95 backdrop-blur-2xl p-6 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-2xl font-extrabold text-[#00ffcc] flex items-center gap-3 tracking-wider">
                ENLARGED 2D ARDUPILOT SECTOR MAP
              </h2>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                Satellite telemetry view with divided sector boundaries, survivor points, and obstacle hazards.
              </p>
            </div>
            <button
              onClick={() => setIsEnlarged(false)}
              className="bg-[#00ffcc] text-black font-extrabold px-4 py-2 rounded-xl text-xs hover:bg-cyan-300 transition shadow-[0_0_15px_rgba(0,255,204,0.5)] cursor-pointer"
            >
              ✕ CLOSE ENLARGED MAP
            </button>
          </div>
          {renderLeafletMap(true)}
        </div>
      )}
    </div>
  );
}

