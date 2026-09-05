import { useState } from 'react';
import type { XAIDroneState, XAIWorldState } from '../types/xai';
import DroneXAICard from './XAIDroneCard';
import { Target, Shield, Scan, Zap, Network, Lock, Satellite, Brain, AlertTriangle } from 'lucide-react';

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@500;600&display=swap';

const C = {
  bg: '#060b10',
  card: '#0c1520',
  cardBord: '#182a3d',
  cyan: '#00d4ff',
  teal: '#00e5a0',
  amber: '#ffb020',
  red: '#ff4444',
  textPri: '#f1f7ff',
  textMut: '#b9cfe0',
  mono: "'Share Tech Mono', monospace",
};

interface XAIDecisionPanelProps {
  droneStates: XAIDroneState[];
  worldState: XAIWorldState;
}

export default function XAIDecisionPanel({
  droneStates,
  worldState,
}: XAIDecisionPanelProps) {
  const [showNarratives, setShowNarratives] = useState(false);
  const survivorsFound =
    worldState.survivors?.filter((s) => s.discovered).length ?? 0;
  const totalSurvivors = worldState.survivors?.length ?? 0;
  const avgBattery = droneStates.length
    ? Math.round(
      droneStates.reduce((s, d) => s + d.battery, 0) / droneStates.length
    )
    : 0;
  const lowBatCount = droneStates.filter((d) => d.battery < 25).length;
  const tick = worldState.tick ?? 0;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('${FONT_URL}');

        @keyframes xai-pulse {
          0%,100% { opacity:1; box-shadow:0 0 8px #00e5a0; }
          50%      { opacity:0.4; box-shadow:0 0 3px #00e5a0; }
        }
        @keyframes xai-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes float-up {
          0% { transform: translateY(0px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
          50% { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,212,255,0.15); }
          100% { transform: translateY(0px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        }
      `}</style>

      <div
        style={{
          background: C.bg,
          minHeight: '100vh',
          padding: '20px 18px',
          fontFamily: C.mono,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: `1px solid ${C.cardBord}`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: C.textMut,
                  letterSpacing: '0.22em',
                  marginBottom: 4,
                }}
              >
                DRONESHIELD · TACTICAL AI
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: C.textPri,
                  letterSpacing: '0.08em',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 600,
                }}
              >
                XAI DECISION MATRIX
              </div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>
                Per-drone zone assignment with confidence and reasoning.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 9,
                  color: C.textMut,
                  letterSpacing: '0.12em',
                  marginBottom: 4,
                }}
              >
                MISSION TICK
              </div>
              <div
                style={{
                  fontSize: 22,
                  color: C.cyan,
                  letterSpacing: '0.06em',
                }}
              >
                T+{String(tick).padStart(4, '0')}
              </div>
            </div>
          </div>

          {/* ── 8-BOX XAI ALGORITHM MATRIX ── */}
          <div style={{ marginBottom: 30 }}>
            <div style={{ fontSize: 13, color: C.cyan, letterSpacing: '0.15em', marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>8-CORE ALGORITHM EXPLAINABILITY MATRIX</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.teal, background: 'rgba(0,229,160,0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(0,229,160,0.3)' }}>
                <AlertTriangle size={12} className="animate-pulse" /> LIVE LOGS SYNCED
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {[
                { title: "Ring Sector Allocator", icon: Target, confidence: 96, desc: "Divides search grid into 5 ring-sectors (North, East, South, West, Core) for zero overlap.", status: "OPTIMAL" },
                { title: "APF Obstacle Avoidance", icon: Shield, confidence: 94, desc: "Repulsive potential fields deflect drones away from 3D building colliders in real-time.", status: "ACTIVE" },
                { title: "YOLO Dual-Spectral AI", icon: Scan, confidence: 98, desc: "Dual-channel RGB + FLIR Thermal IR human target detector uploading snapshots to Cloudinary.", status: "STREAMING" },
                { title: "QoS & Battery Governor", icon: Zap, confidence: 91, desc: "Dynamic velocity scaling & auto-RTL threshold evaluation based on remaining mAh.", status: "MONITORING" },
                { title: "P2P Mesh Network", icon: Network, confidence: 99, desc: "Ad-hoc mesh topology with multi-hop relay fallback when cellular link degrades.", status: "CONNECTED" },
                { title: "Canary Security Audit", icon: Lock, confidence: 100, desc: "Double-wrap payload encryption (AES-256-GCM) with active honeypot canary decoy defense.", status: "SECURE" },
                { title: "GPS-Denied SLAM Nav", icon: Satellite, confidence: 89, desc: "Occupancy grid mapper maintaining EKF dead reckoning under simulated RF jamming.", status: "ACTIVE" },
                { title: "Q-Learning Task Arbiter", icon: Brain, confidence: 93, desc: "Reinforcement learning task allocation balancing exploration vs target rescue exploitation.", status: "INFERRING" },
              ].map((algo) => (
                <div
                  key={algo.title}
                  className="hover:scale-[1.02] transition-transform duration-300"
                  style={{
                    background: 'linear-gradient(145deg, #0f1c2b, #0a131d)',
                    border: `1px solid ${C.cardBord}`,
                    borderRadius: 24,
                    padding: '16px',
                    position: 'relative',
                    overflow: 'hidden',
                    animation: 'float-up 4s ease-in-out infinite alternate',
                    animationDelay: `${Math.random() * 2}s`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ background: 'rgba(0, 212, 255, 0.1)', padding: '8px', borderRadius: '50%' }}>
                      <algo.icon size={20} color={C.cyan} />
                    </div>
                    <span style={{ fontSize: 10, color: C.teal, fontWeight: 700, letterSpacing: '0.1em', background: 'rgba(0,229,160,0.05)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(0,229,160,0.2)' }}>{algo.status}</span>
                  </div>
                  <div style={{ fontSize: 14, color: C.textPri, fontWeight: 700, marginBottom: 6 }}>{algo.title}</div>
                  <div style={{ fontSize: 11, color: C.textMut, lineHeight: '1.4', marginBottom: 12, height: 32 }}>{algo.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: C.cyan, marginBottom: 4, fontWeight: 600 }}>
                    <span>CONFIDENCE LEVEL</span>
                    <span>{algo.confidence}%</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: '#101d2c', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${algo.confidence}%`, height: '100%', background: `linear-gradient(90deg, ${C.cyan}, ${C.teal})` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {[
              { label: 'UAVs ACTIVE', value: droneStates.length, color: C.cyan },
              {
                label: 'SURVIVORS FOUND',
                value: `${survivorsFound}/${totalSurvivors}`,
                color: C.teal,
              },
              {
                label: 'AVG BATTERY',
                value: `${avgBattery}%`,
                color: avgBattery < 30 ? C.red : C.amber,
              },
              {
                label: 'LOW BAT ALERTS',
                value: lowBatCount,
                color: lowBatCount > 0 ? C.red : C.textMut,
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBord}`,
                  borderRadius: 6,
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: C.textMut,
                    letterSpacing: '0.12em',
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    color,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 600,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── ZONE LEGEND ── */}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBord}`,
              borderRadius: 7,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              {/* Left: grid replica */}
              <div>
                <div
                  style={{
                    fontSize: 9,
                    color: C.textMut,
                    letterSpacing: '0.18em',
                    marginBottom: 8,
                  }}
                >
                  ZONE MAP REFERENCE
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 80px)',
                    gridTemplateRows: 'repeat(2, 44px)',
                    gap: 4,
                  }}
                >
                  {[
                    { id: 'Z1', label: 'Alpha', col: 0, row: 0, color: C.cyan },
                    { id: 'Z2', label: 'Bravo', col: 1, row: 0, color: C.teal },
                    { id: 'Z3', label: 'Charlie', col: 2, row: 0, color: '#a78bfa' },
                    { id: 'Z4', label: 'Delta', col: 0, row: 1, color: '#fb923c' },
                    { id: 'Z5', label: 'Echo', col: 1, row: 1, color: '#f472b6' },
                    { id: 'Z6', label: 'Foxtrot', col: 2, row: 1, color: C.amber },
                  ].map((z) => (
                    <div
                      key={z.id}
                      style={{
                        background: `${z.color}0d`,
                        border: `1px solid ${z.color}35`,
                        borderRadius: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: C.mono,
                          color: z.color,
                          letterSpacing: '0.1em',
                          fontWeight: 700,
                        }}
                      >
                        {z.id}
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          fontFamily: C.mono,
                          color: C.textMut,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {z.label.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 8,
                    color: '#4a6070',
                    letterSpacing: '0.06em',
                    fontFamily: C.mono,
                  }}
                >
                  ← WEST · NORTH ↑ · EAST → · SOUTH ↓
                </div>
              </div>

              {/* Right: legend key items */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div
                  style={{
                    fontSize: 9,
                    color: C.textMut,
                    letterSpacing: '0.18em',
                    marginBottom: 8,
                  }}
                >
                  LEGEND
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    { dot: C.teal, label: 'HIGH confidence  ≥ 70%' },
                    { dot: C.amber, label: 'MED confidence   ≥ 40%' },
                    { dot: C.red, label: 'LOW confidence   < 40%' },
                    { dot: C.cyan, label: 'Top-ranked zone (active)' },
                    { dot: '#1a3248', label: 'Lower-ranked zones' },
                  ].map(({ dot, label }) => (
                    <div
                      key={label}
                      style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dot,
                          flexShrink: 0,
                          border: dot === '#1a3248' ? `1px solid #2a4258` : 'none',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: C.mono,
                          color: C.textMut,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 3, borderTop: `1px solid ${C.cardBord}`, paddingTop: 5 }}>
                    <span style={{ fontSize: 10, fontFamily: C.mono, color: C.textMut, letterSpacing: '0.04em' }}>
                      ε = exploration rate · low ε = EXPLOIT mode
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* ── END ZONE LEGEND ── */}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, color: C.textPri, letterSpacing: '0.08em' }}>
              DECISION CARDS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 9, color: C.textMut, letterSpacing: '0.1em' }}>
                ● HIGH ≥70% · ● MED ≥40% · ● LOW &lt;40% · ε = EXPLORATION RATE
              </div>
              <button
                onClick={() => setShowNarratives((prev) => !prev)}
                style={{
                  background: 'none',
                  border: `1px solid ${showNarratives ? C.teal : C.cardBord}`,
                  borderRadius: 4,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontFamily: C.mono,
                  fontSize: 9,
                  color: showNarratives ? C.teal : C.textMut,
                  letterSpacing: '0.12em',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
              >
                {showNarratives ? 'HIDE AI NARRATIVES' : 'SHOW AI NARRATIVES'}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 14,
            }}
          >
            {droneStates.map((drone, i) => (
              <DroneXAICard
                key={drone.id}
                drone={drone}
                worldState={worldState}
                entryDelay={i * 100}
                forceNarrativeOpen={showNarratives}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
