import { useEffect, useRef, useState } from 'react';

export interface FogCell {
  x: number;
  y: number;
  visibility: 0 | 1 | 2; // 0=unknown, 1=revealed, 2=scanned
}

interface LiDARHit {
  x: number;
  y: number;
  dist: number;
  obstacle: boolean;
  angle: number;
}

interface LiDARScan {
  drone_id: number;
  origin: { x: number; y: number };
  hits: LiDARHit[];
}

interface FogState {
  grid: number[][];        // [y][x] = 0|1|2
  shared_obstacles: Array<{ x: number; y: number }>;
  stats: {
    total_cells: number;
    unknown: number;
    revealed: number;
    scanned: number;
    explored_pct: number;
    scanned_pct: number;
  };
}

interface Props {
  fogState: FogState | null;
  lidarCloud: LiDARScan[];
  gridSize?: number;
  worldBoundary?: number;
}

const GRID = 50;
const COLORS = {
  unknown:  '#0a1628',
  revealed: '#1e3a5f',
  scanned:  '#0d4f3c',
  obstacle: '#7f1d1d',
  lidarFree: 'rgba(56,189,248,0.06)',
  lidarHit:  'rgba(239,68,68,0.85)',
  lidarRay:  'rgba(56,189,248,0.15)',
};

export default function FogOfWarMap({ fogState, lidarCloud, gridSize = GRID }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState({ explored_pct: 0, scanned_pct: 0 });

  useEffect(() => {
    if (fogState?.stats) setStats(fogState.stats);
  }, [fogState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cellW = W / gridSize;
    const cellH = H / gridSize;

    ctx.clearRect(0, 0, W, H);

    // Draw fog grid
    if (fogState?.grid) {
      const grid = fogState.grid;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const vis = grid[y]?.[x] ?? 0;
          ctx.fillStyle = vis === 2 ? COLORS.scanned : vis === 1 ? COLORS.revealed : COLORS.unknown;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    } else {
      // No fog state yet — render all unknown
      ctx.fillStyle = COLORS.unknown;
      ctx.fillRect(0, 0, W, H);
    }

    // Draw shared known obstacles
    if (fogState?.shared_obstacles) {
      ctx.fillStyle = COLORS.obstacle;
      for (const obs of fogState.shared_obstacles) {
        ctx.fillRect(obs.x * cellW, obs.y * cellH, cellW, cellH);
      }
    }

    // Draw LiDAR point cloud (hit points = discovered obstacles)
    for (const scan of lidarCloud) {
      const ox = scan.origin.x * cellW + cellW / 2;
      const oy = scan.origin.y * cellH + cellH / 2;

      for (const hit of scan.hits) {
        const hx = hit.x * cellW + cellW / 2;
        const hy = hit.y * cellH + cellH / 2;

        if (hit.obstacle) {
          // Draw ray from origin to hit
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(hx, hy);
          ctx.strokeStyle = COLORS.lidarRay;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Draw hit point
          ctx.beginPath();
          ctx.arc(hx, hy, Math.max(1.5, cellW * 0.4), 0, Math.PI * 2);
          ctx.fillStyle = COLORS.lidarHit;
          ctx.fill();
        }
      }

      // Draw drone origin
      ctx.beginPath();
      ctx.arc(ox, oy, cellW * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${scan.drone_id * 60}, 80%, 60%)`;
      ctx.fill();
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.3;
    for (let x = 0; x <= gridSize; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, H); ctx.stroke();
    }
    for (let y = 0; y <= gridSize; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(W, y * cellH); ctx.stroke();
    }
  }, [fogState, lidarCloud, gridSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8' }}>
        <span>
          <span style={{ color: COLORS.revealed === '#1e3a5f' ? '#38bdf8' : '#38bdf8' }}>▪</span>
          {' '}Revealed: <strong style={{ color: '#e2e8f0' }}>{stats.explored_pct.toFixed(1)}%</strong>
        </span>
        <span>
          <span style={{ color: '#34d399' }}>▪</span>
          {' '}Scanned: <strong style={{ color: '#e2e8f0' }}>{stats.scanned_pct.toFixed(1)}%</strong>
        </span>
        <span>
          <span style={{ color: '#ef4444' }}>▪</span>
          {' '}LiDAR obstacles: <strong style={{ color: '#e2e8f0' }}>{fogState?.shared_obstacles?.length ?? 0}</strong>
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        id="fog-of-war-canvas"
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: 8,
          border: '1px solid rgba(56,189,248,0.15)',
          background: COLORS.unknown,
        }}
      />

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
        {[
          { col: COLORS.unknown,  label: 'Unknown' },
          { col: '#1e3a5f',       label: 'LiDAR Revealed' },
          { col: COLORS.scanned,  label: 'Drone Scanned' },
          { col: COLORS.obstacle, label: 'Obstacle' },
          { col: COLORS.lidarHit, label: 'LiDAR Hit' },
        ].map(({ col, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: col, borderRadius: 2, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
