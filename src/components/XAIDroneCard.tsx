import { useEffect, useMemo, useState } from 'react';
import type { XAIDroneState, XAIWorldState } from '../types/xai';
import { deriveXAI } from '../xai-engine';
import ConfidenceGauge from './XAIConfidenceGauge';
import FactorBreakdown from './XAIFactorBreakdown';
import ZoneBar from './XAIZoneBar';

const C = {
  card: '#0c1520',
  cardBord: '#182a3d',
  zone: '#060f18',
  zoneBord: '#0d2030',
  cyan: '#00d4ff',
  teal: '#00e5a0',
  amber: '#ffb020',
  red: '#ff4444',
  textPri: '#f1f7ff',
  textSec: '#cfe1ef',
  textMut: '#b9cfe0',
  mono: "'Share Tech Mono', monospace",
};

function confColor(c: number): string {
  return c >= 70 ? C.teal : c >= 40 ? C.amber : C.red;
}

interface DroneXAICardProps {
  drone: XAIDroneState;
  worldState: XAIWorldState;
  entryDelay: number;
  forceNarrativeOpen?: boolean;
}

export default function DroneXAICard({
  drone,
  worldState,
  entryDelay,
  forceNarrativeOpen,
}: DroneXAICardProps) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showAllReasons, setShowAllReasons] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);

  const xai = useMemo(() => deriveXAI(drone, worldState), [drone, worldState]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), entryDelay);
    return () => clearTimeout(t);
  }, [entryDelay]);

  useEffect(() => {
    if (typeof forceNarrativeOpen === 'boolean') {
      setShowNarrative(forceNarrativeOpen);
    }
  }, [forceNarrativeOpen]);

  const battColor =
    drone.battery < 25 ? C.red : drone.battery < 50 ? C.amber : C.teal;

  const statusConfig: Record<string, { bg: string; border: string; text: string }> = {
    'LOW BAT': { bg: `${C.red}18`, border: `${C.red}35`, text: C.red },
    SEARCHING: { bg: `${C.teal}18`, border: `${C.teal}35`, text: C.teal },
    SCANNING: { bg: `${C.cyan}18`, border: `${C.cyan}35`, text: C.cyan },
    RETURNING: { bg: `${C.amber}18`, border: `${C.amber}35`, text: C.amber },
  };
  const sc = statusConfig[drone.status ?? 'SEARCHING'] ?? statusConfig.SEARCHING;

  const modeConfig: Record<string, { bg: string; border: string; text: string }> = {
    EXPLORE: { bg: `${C.cyan}18`, border: `${C.cyan}35`, text: C.cyan },
    BALANCED: { bg: `${C.amber}18`, border: `${C.amber}35`, text: C.amber },
    EXPLOIT: { bg: `${C.teal}18`, border: `${C.teal}35`, text: C.teal },
  };
  const mc = modeConfig[xai.mode];

  const confC = confColor(xai.confidence);
  const droneIdNumeric =
    typeof drone.id === 'number'
      ? drone.id
      : Number.parseInt(String(drone.id).replace(/\D+/g, ''), 10) || 0;
  const signalColor =
    drone.signal < 45 ? C.red : drone.signal < 70 ? C.amber : C.teal;
  const keyReasons = xai.reasons.slice(0, 3);
  const extraReasons = xai.reasons.slice(3);

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBord}`,
        borderTop: `2px solid ${confC}`,
        borderRadius: 8,
        padding: '14px 15px',
        fontFamily: C.mono,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '-100%',
          right: 0,
          height: '100%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.04) 50%, transparent 100%)',
          animation: `xai-scan 1.2s ${entryDelay}ms ease forwards`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 14,
              color: C.textPri,
              letterSpacing: '0.12em',
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
            }}
          >
            UAV·{String(drone.id).padStart(3, '0')}
          </span>
          <span
            style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 3,
              background: sc.bg,
              border: `1px solid ${sc.border}`,
              color: sc.text,
              letterSpacing: '0.12em',
            }}
          >
            {drone.status ?? 'SEARCHING'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 26,
              height: 10,
              border: `1px solid ${battColor}50`,
              borderRadius: 2,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2px',
            }}
          >
            <div
              style={{
                height: 6,
                width: `${Math.min(100, drone.battery)}%`,
                background: battColor,
                borderRadius: 1,
                boxShadow: drone.battery < 25 ? `0 0 4px ${C.red}` : 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: -3,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 2,
                height: 5,
                background: battColor,
                borderRadius: '0 1px 1px 0',
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: battColor, minWidth: 28 }}>
            {drone.battery}%
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginTop: 10,
          marginBottom: 12,
        }}
      >
        {[
          { label: 'SIGNAL', value: `${Math.round(drone.signal)}%`, color: signalColor },
          {
            label: 'SPEED',
            value: drone.speed !== undefined ? `${Math.round(drone.speed)} u/s` : '--',
            color: C.textPri,
          },
          {
            label: 'HDG',
            value: drone.heading !== undefined ? `${Math.round(drone.heading)}°` : '--',
            color: C.textPri,
          },
          {
            label: 'TASK',
            value: drone.task ? drone.task.toUpperCase() : '--',
            color: C.textPri,
          },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontSize: 8, color: C.textMut, letterSpacing: '0.12em' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, color: item.color, marginTop: 3 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          background: C.zone,
          border: `1px solid ${C.zoneBord}`,
          borderRadius: 5,
          padding: '8px 10px',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: C.teal,
            boxShadow: `0 0 8px ${C.teal}`,
            animation: 'xai-pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9,
              color: C.textMut,
              letterSpacing: '0.14em',
              marginBottom: 2,
            }}
          >
            ASSIGNED ZONE
          </div>
          <div style={{ fontSize: 12, color: C.teal, letterSpacing: '0.08em' }}>
            {xai.assignedZone.id} · {xai.assignedZone.label.toUpperCase()} SECTOR
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontSize: 9,
              color: C.textMut,
              letterSpacing: '0.1em',
              marginBottom: 2,
            }}
          >
            Q-MODE
          </div>
          <span
            style={{
              fontSize: 9,
              padding: '2px 7px',
              borderRadius: 3,
              background: mc.bg,
              border: `1px solid ${mc.border}`,
              color: mc.text,
              letterSpacing: '0.1em',
            }}
          >
            {xai.mode}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 9,
            color: C.textMut,
            letterSpacing: '0.14em',
            marginBottom: 8,
          }}
        >
          ZONE PRIORITY SCORES
        </div>
        {xai.zoneScores.map((zone, i) => (
          <ZoneBar
            key={zone.id}
            zone={zone}
            maxScore={xai.zoneScores[0].score}
            rank={i}
            animDelay={i * 90 + droneIdNumeric * 60}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10 }}>
        <div
          style={{
            background: C.zone,
            border: `1px solid ${C.zoneBord}`,
            borderRadius: 6,
            padding: '8px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ConfidenceGauge confidence={xai.confidence} />
        </div>
        <div
          style={{
            background: C.zone,
            border: `1px solid ${C.zoneBord}`,
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: C.textMut,
              letterSpacing: '0.14em',
              marginBottom: 6,
            }}
          >
            KEY REASONS
          </div>
          {keyReasons.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span style={{ color: C.textMut, fontSize: 10, marginTop: 1 }}>
                •
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: drone.battery < 25 ? C.amber : '#c4f5df',
                  lineHeight: 1.5,
                  letterSpacing: '0.02em',
                }}
              >
                {r}
              </span>
            </div>
          ))}
          {extraReasons.length > 0 && (
            <button
              onClick={() => setShowAllReasons((prev) => !prev)}
              style={{
                marginTop: 4,
                background: 'none',
                border: 'none',
                padding: 0,
                color: C.cyan,
                fontSize: 9,
                cursor: 'pointer',
                letterSpacing: '0.1em',
              }}
            >
              {showAllReasons ? 'HIDE DETAILS' : 'SHOW DETAILS'}
            </button>
          )}
          {showAllReasons &&
            extraReasons.map((r, i) => (
              <div
                key={`extra-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <span style={{ color: C.textMut, fontSize: 10, marginTop: 1 }}>
                  •
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#c4f5df',
                    lineHeight: 1.5,
                    letterSpacing: '0.02em',
                  }}
                >
                  {r}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginTop: 10,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 9, color: C.textMut, whiteSpace: 'nowrap' }}>
          ε={xai.epsilon}%
        </span>
        <div
          style={{
            flex: 1,
            height: 2,
            background: C.zoneBord,
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${xai.epsilon}%`,
              background: `linear-gradient(90deg, ${C.cyan}, ${C.teal})`,
              borderRadius: 1,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
        <span style={{ fontSize: 9, color: C.textMut, whiteSpace: 'nowrap' }}>
          EXPLOIT
        </span>
      </div>

      {/* Factor Breakdown Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'none',
          border: `1px solid ${C.zoneBord}`,
          borderRadius: 4,
          padding: '5px 0',
          cursor: 'pointer',
          fontFamily: C.mono,
          fontSize: 9,
          color: C.textSec,
          letterSpacing: '0.12em',
          transition: 'border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = C.cyan;
          e.currentTarget.style.color = C.cyan;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = C.zoneBord;
          e.currentTarget.style.color = C.textSec;
        }}
      >
        {expanded ? '▲ HIDE FACTOR BREAKDOWN' : '▼ SHOW FACTOR BREAKDOWN'}
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <FactorBreakdown
            factors={xai.topFactors}
            totalScore={xai.assignedZone.score}
          />
        </div>
      )}

      {/* AI Narrative / Detailed Reasoning Toggle */}
      <button
        onClick={() => setShowNarrative(!showNarrative)}
        style={{
          width: '100%',
          marginTop: 7,
          background: 'none',
          border: `1px solid ${drone.battery < 25 ? '#ff444430' : '#ffb02030'}`,
          borderRadius: 4,
          padding: '5px 0',
          cursor: 'pointer',
          fontFamily: C.mono,
          fontSize: 9,
          color: drone.battery < 25 ? C.red : C.amber,
          letterSpacing: '0.12em',
          transition: 'border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={(e) => {
          const col = drone.battery < 25 ? C.red : C.amber;
          e.currentTarget.style.borderColor = col;
          e.currentTarget.style.color = col;
        }}
        onMouseLeave={(e) => {
          const col = drone.battery < 25 ? `${C.red}50` : `${C.amber}50`;
          e.currentTarget.style.borderColor = col;
          e.currentTarget.style.color = drone.battery < 25 ? C.red : C.amber;
        }}
      >
        {showNarrative ? '▲ HIDE AI NARRATIVE' : '▼ SHOW AI NARRATIVE'}
      </button>

      {showNarrative && (
        <div
          style={{
            marginTop: 7,
            background: drone.battery < 25 ? `${C.red}08` : `${C.amber}08`,
            border: `1px solid ${drone.battery < 25 ? `${C.red}25` : `${C.amber}25`}`,
            borderLeft: `2px solid ${drone.battery < 25 ? C.red : C.amber}`,
            borderRadius: 5,
            padding: '9px 11px',
          }}
        >
          <div
            style={{
              fontSize: 8,
              color: drone.battery < 25 ? C.red : C.amber,
              letterSpacing: '0.18em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ fontSize: 10 }}>{drone.battery < 25 ? '⚠' : '🧠'}</span>
            AI REASONING NARRATIVE
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: C.textSec,
              lineHeight: 1.65,
              letterSpacing: '0.02em',
              fontFamily: C.mono,
            }}
          >
            {xai.detailedReasoning}
          </p>
        </div>
      )}
    </div>
  );
}
