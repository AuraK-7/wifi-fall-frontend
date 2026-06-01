import { useMemo } from 'react';
import { useAppStore } from '../../store';
import { getThemeColors, fontFamily } from '../../styles/tokens';

interface Props {
  size?: number;
}

export default function ConfidenceGauge({ size = 150 }: Props) {
  const darkMode = useAppStore((s) => s.darkMode);
  const tk = getThemeColors(darkMode);
  const result = useAppStore((s) => s.latestMessage?.result);
  const confidence = result?.confidence ?? 0;
  const alert = result?.alert ?? false;
  const pct = Math.round(confidence * 100);

  const ringColor = useMemo(() => {
    if (pct >= 90) return '#ef4444';
    if (pct >= 70) return '#f59e0b';
    if (pct >= 50) return '#eab308';
    return '#22c55e';
  }, [pct]);

  const labelColor = darkMode ? '#8899aa' : '#445566';
  const bgRing = darkMode ? '#1a2a3a' : '#e5e7eb';
  const circumference = 2 * Math.PI * 52;
  const dash = (pct / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke={bgRing} strokeWidth="10" />
        <circle
          cx="60" cy="60" r="52" fill="none" stroke={ringColor} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.3s ease' }}
        />
        {alert && (
          <circle cx="60" cy="60" r="52" fill="none" stroke="#ef4444" strokeWidth="12"
            opacity={0.3} strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90 60 60)" style={{ filter: 'blur(4px)' }} />
        )}
        <text x="60" y="55" textAnchor="middle" fill={ringColor} fontSize="26" fontWeight="bold" fontFamily="monospace">
          {pct}%
        </text>
        <text x="60" y="72" textAnchor="middle" fill={labelColor} fontSize="9" fontFamily="monospace">
          置信度
        </text>
      </svg>
      <div style={{ fontSize: 10, color: labelColor, fontFamily: fontFamily.mono, textAlign: 'center' }}>
        {alert ? '⚠ 告警中' : result?.predicted_label ?? '--'}
      </div>
    </div>
  );
}
