import { useMemo } from 'react';
import { useAppStore } from '../../store';
import { getThemeColors, fontFamily } from '../../styles/tokens';

interface MetricCardProps {
  title: string;
  value: number;
  prevValue: number;
  unit: string;
  decimals: number;
}

function MetricCard({ title, value, prevValue, unit, decimals }: MetricCardProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const tk = getThemeColors(darkMode);
  const delta = prevValue !== 0 ? value - prevValue : 0;
  const trend = delta > 0.001 ? '↑' : delta < -0.001 ? '↓' : '→';
  const trendColor = delta > 0.001 ? '#ef4444' : delta < -0.001 ? '#22c55e' : tk.text.muted;

  return (
    <div style={{
      flex: 1, minWidth: 100,
      background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `1px solid ${darkMode ? '#1a2a3a' : '#e5e7eb'}`,
      borderRadius: 2, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 9, color: tk.text.muted, fontFamily: fontFamily.mono, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: fontFamily.mono, color: tk.text.primary }}>
          {value.toFixed(decimals)}
        </span>
        <span style={{ fontSize: 10, color: tk.text.muted, fontFamily: fontFamily.mono }}>{unit}</span>
      </div>
      <div style={{ fontSize: 9, color: trendColor, fontFamily: fontFamily.mono }}>
        {trend} {Math.abs(delta).toFixed(decimals)}
      </div>
    </div>
  );
}

export default function MetricCards() {
  const analyticsHistory = useAppStore((s) => s.analyticsHistory);

  const { current, previous } = useMemo(() => {
    const len = analyticsHistory.length;
    const cur = len > 0 ? analyticsHistory[len - 1] : null;
    const prev = len > 1 ? analyticsHistory[len - 2] : null;
    return { current: cur, previous: prev };
  }, [analyticsHistory]);

  const metrics = useMemo(() => {
    if (!current) {
      return [
        { title: '信号能量', value: 0, unit: 'a.u.', decimals: 1 },
        { title: '主频', value: 0, unit: 'Hz', decimals: 1 },
        { title: '多普勒带宽', value: 0, unit: 'Hz', decimals: 1 },
        { title: '信号方差', value: 0, unit: 'σ²', decimals: 4 },
      ];
    }
    return [
      { title: '信号能量', value: current.energy ?? 0, unit: 'a.u.', decimals: 1 },
      { title: '主频', value: current.dominant_freq ?? 0, unit: 'Hz', decimals: 1 },
      { title: '多普勒带宽', value: current.frequency_spread ?? 0, unit: 'Hz', decimals: 1 },
      { title: '信号方差', value: current.signal_variance ?? 0, unit: 'σ²', decimals: 4 },
    ];
  }, [current]);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {metrics.map((m) => (
        <MetricCard key={m.title}
          title={m.title} value={m.value}
          prevValue={previous ? (previous as any)[m.title] ?? 0 : 0}
          unit={m.unit} decimals={m.decimals} />
      ))}
    </div>
  );
}
