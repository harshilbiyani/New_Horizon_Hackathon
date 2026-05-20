const C = {
  cyan: '#00d4ff',
  teal: '#00e5a0',
  amber: '#ffb020',
  red: '#ff4444',
  textMut: '#1e3a52',
  mono: "'Share Tech Mono', monospace",
};

function confColor(c: number): string {
  return c >= 70 ? C.teal : c >= 40 ? C.amber : C.red;
}

interface ConfidenceGaugeProps {
  confidence: number;
}

export default function ConfidenceGauge({ confidence }: ConfidenceGaugeProps) {
  const cx = 38,
    cy = 38,
    r = 26;
  const deg2xy = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const startDeg = 130;
  const sweepDeg = 280;
  const [sx, sy] = deg2xy(startDeg);
  const [ex, ey] = deg2xy(startDeg + sweepDeg);
  const valueSweep = sweepDeg * (confidence / 100);
  const [vx, vy] = deg2xy(startDeg + valueSweep);

  const trackD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  const valueLarge = valueSweep > 180 ? 1 : 0;
  const valueD =
    confidence > 0
      ? `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${valueLarge} 1 ${vx.toFixed(1)} ${vy.toFixed(1)}`
      : null;

  const color = confColor(confidence);

  return (
    <svg width="76" height="64" style={{ flexShrink: 0, overflow: 'visible' }}>
      <defs>
        <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={trackD}
        fill="none"
        stroke={C.cyan + '30'}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {valueD && (
        <path
          d={valueD}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#g-glow)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      )}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fill={color}
        fontSize="15"
        fontFamily={C.mono}
        fontWeight="bold"
      >
        {confidence}%
      </text>
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        fill={C.textMut}
        fontSize="8"
        fontFamily={C.mono}
        letterSpacing="1.5"
      >
        CONF
      </text>
    </svg>
  );
}
