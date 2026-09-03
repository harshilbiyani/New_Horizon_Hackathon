import type { FactorBreakdown } from '../types/xai';

const C = {
  cyan: '#00d4ff',
  teal: '#00e5a0',
  amber: '#ffb020',
  textMut: '#b9cfe0',
  zone: '#060f18',
  zoneBord: '#0d2030',
  mono: "'Share Tech Mono', monospace",
};

interface FactorBreakdownProps {
  factors: FactorBreakdown;
  totalScore: number;
}

export default function FactorBreakdown({
  factors,
  totalScore: _totalScore,
}: FactorBreakdownProps) {
  const items = [
    { key: 'coverage' as const, label: 'COVERAGE GAP', color: C.cyan },
    { key: 'survivor' as const, label: 'SURVIVOR PROX', color: C.teal },
    { key: 'clearance' as const, label: 'OBSTACLE CLR', color: C.amber },
    { key: 'proximity' as const, label: 'TRAVEL COST', color: '#a0c0e0' },
  ];

  return (
    <div
      style={{
        background: C.zone,
        border: `1px solid ${C.zoneBord}`,
        borderRadius: 5,
        padding: '8px 10px',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: C.mono,
          color: C.textMut,
          letterSpacing: '0.14em',
          marginBottom: 7,
        }}
      >
        FACTOR BREAKDOWN
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
        {items.map(({ key, label, color }) => {
          const val = factors[key] ?? 0;
          const max =
            key === 'coverage'
              ? 35
              : key === 'survivor'
                ? 30
                : key === 'clearance'
                  ? 15
                  : 20;
          const pct = Math.round((val / max) * 100);
          return (
            <div key={key}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: C.mono,
                    fontSize: 9,
                    color: C.textMut,
                    letterSpacing: '0.06em',
                  }}
                >
                  {label}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color }}>
                  {val}
                </span>
              </div>
              <div
                style={{
                  height: 2,
                  background: C.zoneBord,
                  borderRadius: 1,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 1,
                    opacity: 0.7,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
