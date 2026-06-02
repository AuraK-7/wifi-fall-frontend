import { useMemo } from 'react';
import { useAppStore } from '../../store';
import { getThemeColors, fontFamily } from '../../styles/tokens';

interface Props {
  size?: number;
  label?: string | null;
  confidence?: number | null;
}

export default function ConfidenceGauge({ size = 150, label, confidence }: Props) {
  const dm = useAppStore(s => s.darkMode);
  const tk = getThemeColors(dm);
  const result = useAppStore(s => s.latestMessage?.result);
  const lbl = label ?? result?.predicted_label ?? '--';
  const conf = confidence ?? result?.confidence ?? 0;
  const pct = Math.round(conf * 100);

  const ringColor = useMemo(() => {
    if (lbl === 'fall') return '#ef4444';       // red
    if (lbl === 'non_fall') return '#22c55e';   // green
    return '#f59e0b';                            // yellow (other/uncertain)
  }, [lbl]);

  const labelColor = dm ? '#8899aa' : '#445566';
  const bgRing = dm ? '#1a2a3a' : '#e5e7eb';
  const circ = 2 * Math.PI * 52;
  const dash = (pct / 100) * circ;

  const statusText = lbl === 'fall' ? '⚠ 摔倒' : lbl === 'non_fall' ? '● 正常' : lbl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke={bgRing} strokeWidth="10" />
        <circle cx="60" cy="60" r="52" fill="none" stroke={ringColor} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.3s ease' }}
        />
        {lbl === 'fall' && (
          <circle cx="60" cy="60" r="52" fill="none" stroke="#ef4444" strokeWidth="12"
            opacity={0.25} strokeDasharray={`${dash} ${circ - dash}`}
            transform="rotate(-90 60 60)" style={{ filter: 'blur(4px)' }} />
        )}
        <text x="60" y="55" textAnchor="middle" fill={ringColor} fontSize="26" fontWeight="bold"
          fontFamily={fontFamily.mono}>{pct}%</text>
        <text x="60" y="72" textAnchor="middle" fill={labelColor} fontSize="9"
          fontFamily={fontFamily.mono}>置信度</text>
      </svg>
      <div style={{ fontSize: 10, color: ringColor, fontFamily: fontFamily.mono, textAlign: 'center', fontWeight: 600 }}>
        {statusText}
      </div>
    </div>
  );
}
