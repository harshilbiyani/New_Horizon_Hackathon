import { useState } from 'react';

interface Scenario {
  id: string;
  name: string;
  icon: string;
  description: string;
  environment: string;
  gps_denied: boolean;
  highlight_features: string[];
  ui_theme: { color: string; bg: string; accent: string };
  tick_ms: number;
}

interface Props {
  scenarios: Scenario[];
  currentScenarioId: string | null;
  onSelect: (scenarioId: string) => void;
  onStart: (scenarioId: string) => void;
  onStop: () => void;
  onReset: () => void;
  simulationRunning: boolean;
}

export default function ScenarioSelector({
  scenarios,
  currentScenarioId,
  onSelect,
  onStart,
  onStop,
  onReset,
  simulationRunning,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const current = scenarios.find(s => s.id === currentScenarioId) ?? scenarios[0];

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>🎯 Mission Scenario</span>
        <span style={styles.headerSub}>Select disaster type for simulation</span>
      </div>

      {/* Scenario cards */}
      <div style={styles.cardGrid}>
        {scenarios.map(s => {
          const isActive = s.id === currentScenarioId;
          const isExpanded = expanded === s.id;
          return (
            <div
              key={s.id}
              id={`scenario-card-${s.id}`}
              style={{
                ...styles.card,
                border: `1px solid ${isActive ? s.ui_theme.color : 'rgba(255,255,255,0.08)'}`,
                background: isActive ? `${s.ui_theme.color}18` : 'rgba(15,23,42,0.6)',
                cursor: 'pointer',
              }}
              onClick={() => {
                onSelect(s.id);
                setExpanded(isExpanded ? null : s.id);
              }}
            >
              <div style={styles.cardHeader}>
                <span style={styles.icon}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.name, color: isActive ? s.ui_theme.color : '#e2e8f0' }}>
                    {s.name}
                  </div>
                  <div style={styles.envBadge}>{s.environment.replace('_', ' ')}</div>
                </div>
                {s.gps_denied && (
                  <span style={styles.gpsBadge}>📡 GPS DENIED</span>
                )}
              </div>

              {isExpanded && (
                <div style={styles.expandedBody}>
                  <p style={styles.desc}>{s.description}</p>
                  <div style={styles.features}>
                    {s.highlight_features.map((f, i) => (
                      <div key={i} style={{ ...styles.featureItem, color: s.ui_theme.accent }}>
                        ✓ {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Control buttons */}
      <div style={styles.controls}>
        {!simulationRunning ? (
          <button
            id="btn-scenario-start"
            style={{ ...styles.btn, background: current?.ui_theme?.color ?? '#3b82f6' }}
            onClick={() => onStart(currentScenarioId ?? scenarios[0]?.id)}
          >
            ▶ Launch {current?.icon} {current?.name ?? 'Mission'}
          </button>
        ) : (
          <button
            id="btn-scenario-stop"
            style={{ ...styles.btn, background: '#7f1d1d' }}
            onClick={onStop}
          >
            ⏹ Abort Mission
          </button>
        )}
        <button
          id="btn-scenario-reset"
          style={{ ...styles.btnSecondary }}
          onClick={onReset}
          disabled={simulationRunning}
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', gap: 12,
    background: 'rgba(2,8,23,0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 16,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
  headerTitle: { fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.5px' },
  headerSub: { fontSize: 11, color: '#64748b' },
  cardGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    borderRadius: 10, padding: '10px 14px',
    transition: 'all 0.2s ease',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10 },
  icon: { fontSize: 22, lineHeight: 1 },
  name: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  envBadge: {
    fontSize: 10, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  gpsBadge: {
    fontSize: 9, background: 'rgba(239,68,68,0.2)',
    color: '#ef4444', padding: '2px 6px',
    borderRadius: 4, fontWeight: 700,
  },
  expandedBody: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' },
  desc: { fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 8px 0' },
  features: { display: 'flex', flexDirection: 'column', gap: 4 },
  featureItem: { fontSize: 11, fontWeight: 500 },
  controls: { display: 'flex', gap: 8, marginTop: 4 },
  btn: {
    flex: 1, padding: '10px 16px', borderRadius: 8,
    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    color: '#fff', transition: 'opacity 0.2s',
  },
  btnSecondary: {
    padding: '10px 16px', borderRadius: 8, fontSize: 13,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#94a3b8', cursor: 'pointer', fontWeight: 600,
  },
};
