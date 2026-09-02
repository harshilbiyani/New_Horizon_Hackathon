import { useEffect, useRef } from 'react';

interface DroneGPS {
  id: string;
  gps_denied: boolean;
  estimated_x: number;
  estimated_y: number;
  x: number;
  y: number;
  position_uncertainty: number;
  battery: number;
  status: string;
}

interface Props {
  drones: DroneGPS[];
  gpsGlobalDenied: boolean;
  onToggleGPS: (denied: boolean) => void;
  gridSize?: number;
}

const DRONE_COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#fb923c', '#f472b6'];

export default function GPSStatusIndicator({ drones, gpsGlobalDenied, onToggleGPS, gridSize = 50 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#020817';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo(i * W / 10, 0); ctx.lineTo(i * W / 10, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * H / 10); ctx.lineTo(W, i * H / 10); ctx.stroke();
    }

    const toCanvas = (gx: number, gy: number) => ({
      cx: (gx / gridSize) * W,
      cy: (gy / gridSize) * H,
    });

    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const color = DRONE_COLORS[i % DRONE_COLORS.length];
      const { cx: tcx, cy: tcy } = toCanvas(d.x, d.y);
      const { cx: ecx, cy: ecy } = toCanvas(d.estimated_x, d.estimated_y);

      if (gpsGlobalDenied || d.gps_denied) {
        // Draw uncertainty circle (radius = uncertainty * scale)
        const unc = (d.position_uncertainty / gridSize) * W;
        ctx.beginPath();
        ctx.arc(ecx, ecy, Math.max(4, unc), 0, Math.PI * 2);
        ctx.fillStyle = `${color}18`;
        ctx.fill();
        ctx.strokeStyle = `${color}55`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Line: estimated → true (shows drift error)
        if (Math.abs(tcx - ecx) > 1 || Math.abs(tcy - ecy) > 1) {
          ctx.beginPath();
          ctx.moveTo(ecx, ecy);
          ctx.lineTo(tcx, tcy);
          ctx.strokeStyle = 'rgba(239,68,68,0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Estimated position (operator sees this — hollow ring)
        ctx.beginPath();
        ctx.arc(ecx, ecy, 5, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'transparent';

        // True position (small dot — hidden in real ops)
        ctx.beginPath();
        ctx.arc(tcx, tcy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239,68,68,0.6)';
        ctx.fill();

      } else {
        // GPS active — true position = estimated (solid dot)
        ctx.beginPath();
        ctx.arc(tcx, tcy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = color;
      ctx.font = '9px monospace';
      ctx.fillText(`D${i + 1}`, ecx + 7, ecy - 4);
    }
  }, [drones, gpsGlobalDenied, gridSize]);

  const avgUncertainty = drones.reduce((s, d) => s + d.position_uncertainty, 0) / Math.max(1, drones.length);

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={{ fontSize: 16 }}>{gpsGlobalDenied ? '📡' : '🛰️'}</span>
          <span style={{ color: gpsGlobalDenied ? '#ef4444' : '#34d399', fontWeight: 700, fontSize: 13 }}>
            {gpsGlobalDenied ? 'GPS DENIED — Dead Reckoning' : 'GPS Active'}
          </span>
        </div>
        <button
          id="btn-gps-toggle"
          onClick={() => onToggleGPS(!gpsGlobalDenied)}
          style={{
            ...styles.toggleBtn,
            background: gpsGlobalDenied ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)',
            border: `1px solid ${gpsGlobalDenied ? '#ef4444' : '#34d399'}`,
            color: gpsGlobalDenied ? '#ef4444' : '#34d399',
          }}
        >
          {gpsGlobalDenied ? 'Restore GPS' : 'Deny GPS'}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={280}
        height={160}
        id="gps-status-canvas"
        style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}
      />

      <div style={styles.statsRow}>
        <span style={styles.stat}>
          Avg uncertainty: <strong style={{ color: avgUncertainty > 3 ? '#ef4444' : '#34d399' }}>
            ±{avgUncertainty.toFixed(1)} cells
          </strong>
        </span>
        {gpsGlobalDenied && (
          <span style={{ ...styles.stat, color: '#94a3b8', fontSize: 10 }}>
            ○ Estimated  •<span style={{ color: '#ef4444' }}>•</span> True (hidden in ops)
          </span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', gap: 10,
    background: 'rgba(2,8,23,0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 14,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { display: 'flex', alignItems: 'center', gap: 8 },
  toggleBtn: {
    padding: '5px 12px', borderRadius: 6, fontSize: 11,
    fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
  },
  statsRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  stat: { fontSize: 11, color: '#64748b' },
};
