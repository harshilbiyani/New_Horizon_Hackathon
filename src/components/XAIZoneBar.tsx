import { useEffect, useState } from 'react';
import type { ZoneScore } from '../types/xai';

interface ZoneBarProps {
  zone: ZoneScore;
  maxScore: number;
  rank: number;
  animDelay: number;
}

const C = {
  cyan: '#00d4ff',
  teal: '#00e5a0',
  amber: '#ffb020',
  red: '#ff4444',
  textPri: '#dde8f0',
  textMut: '#1e3a52',
  textSec: '#4a7a9a',
  zoneBord: '#0d2030',
  mono: "'Share Tech Mono', monospace",
};

export default function ZoneBar({ zone, maxScore, rank, animDelay }: ZoneBarProps) {
  const [w, setW] = useState(0);
  const pct = maxScore > 0 ? Math.round((zone.score / maxScore) * 100) : 0;
  const isTop = rank === 0;

  useEffect(() => {
    const t = setTimeout(() => setW(pct), animDelay);
    return () => clearTimeout(t);
  }, [pct, animDelay]);

  const barColor = isTop
    ? zone.score > 55
      ? C.teal
      : zone.score > 30
        ? C.amber
        : C.red
    : '#1a3248';

  const labelColor = isTop ? C.textPri : C.textMut;
  const scoreColor = isTop ? C.textPri : '#1e3a52';

  return (
    <div style={{ marginBottom: 7 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 3,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: C.mono,
            fontSize: 10,
            color: labelColor,
            letterSpacing: '0.08em',
          }}
        >
          {isTop ? (
            <span style={{ color: barColor }}>▶ {zone.label.toUpperCase()}</span>
          ) : (
            <span style={{ color: C.textMut }}>  {zone.label.toUpperCase()}</span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isTop && (
            <span
              style={{
                fontSize: 9,
                fontFamily: C.mono,
                color: C.textMut,
              }}
            >
              cvr={Math.round((1 - zone.score / 90) * 100)}%
            </span>
          )}
          <span
            style={{
              fontFamily: C.mono,
              fontSize: 11,
              color: scoreColor,
              minWidth: 24,
              textAlign: 'right',
            }}
          >
            {zone.score.toString().padStart(3, '0')}
          </span>
        </div>
      </div>
      <div
        style={{
          height: 3,
          background: C.zoneBord,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${w}%`,
            background: isTop
              ? `linear-gradient(90deg, ${C.cyan}, ${barColor})`
              : '#1a3248',
            borderRadius: 2,
            transition: 'width 0.65s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: isTop ? `0 0 6px ${barColor}50` : 'none',
          }}
        />
      </div>
    </div>
  );
}
