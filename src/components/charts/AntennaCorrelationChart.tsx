import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store';

interface Props { height?: number; highlightFrameId?: number | null }

const MAX = 200;
const ML = 52, MR = 14, MT = 10, MB = 30;

export default function AntennaCorrelationChart({ height = 200, highlightFrameId }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const ah = useAppStore(s => s.analyticsHistory);
  const dm = useAppStore(s => s.darkMode);
  const last = useRef(-2);
  const prevN = useRef(0);

  const paint = () => {
    const w = wrap.current, c = cv.current;
    if (!w || !c) return;
    const W = w.clientWidth, H = w.clientHeight;
    if (W < 20 || H < 20) return;
    const dp = window.devicePixelRatio || 1;
    c.width = Math.round(W * dp); c.height = Math.round(H * dp);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dp, 0, 0, dp, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const recent = ah.slice(-MAX);
    const N = recent.length;
    if (N === 0) return;
    const lf = recent[N - 1]?.frame_id ?? -1;
    if (N === prevN.current && lf === last.current) return;
    prevN.current = N; last.current = lf;

    const vals = recent.map(e => e?.antenna_correlation ?? 0);
    const px = W - ML - MR, py = H - MT - MB;
    if (px <= 0 || py <= 0) return;

    const tx = dm ? '#aabbcc' : '#556677';
    const lc = dm ? '#3a4a5a' : '#ccdddd';

    // BG
    ctx.fillStyle = dm ? 'rgba(10,14,24,0.3)' : 'rgba(248,250,252,0.3)';
    ctx.fillRect(ML, MT, px, py);

    // Threshold line (0.7)
    const threshY = MT + py * 0.15;
    ctx.strokeStyle = 'rgba(255,100,68,0.6)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(ML, threshY); ctx.lineTo(ML + px, threshY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6644'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText('0.7 (跌倒阈值)', ML + px - 110, threshY - 3);

    // Zero line
    const zeroY = MT + py * 0.5;
    ctx.strokeStyle = lc; ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(ML, zeroY); ctx.lineTo(ML + px, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Data line
    ctx.strokeStyle = '#00aacc'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const v = Math.max(-1, Math.min(1, vals[i]));
      const x = ML + (i / (N - 1 || 1)) * px;
      const y = MT + py - ((v + 1) / 2) * py;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = lc; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(ML - 0.5, MT); ctx.lineTo(ML - 0.5, MT + py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ML, MT + py + 0.5); ctx.lineTo(ML + px, MT + py + 0.5); ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = tx; ctx.font = '9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('1.0', ML - 6, MT + py * 0.025);
    ctx.fillText('0.5', ML - 6, MT + py * 0.25);
    ctx.fillText('0', ML - 6, MT + py * 0.5);
    ctx.fillText('-0.5', ML - 6, MT + py * 0.75);
    ctx.fillText('-1.0', ML - 6, MT + py * 0.975);
    // Y-axis label
    ctx.save();
    ctx.translate(14, MT + py / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('皮尔逊相关系数', 0, 0);
    ctx.restore();

    // X-axis
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('时间帧', ML + px / 2, MT + py + 18);

    if (highlightFrameId != null) {
      const idx = recent.findIndex(e => e.frame_id === highlightFrameId);
      if (idx >= 0) {
        const x = ML + (idx / (N - 1 || 1)) * px;
        ctx.strokeStyle = 'rgba(255,68,68,0.8)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + py); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  useEffect(() => { paint(); });
  useEffect(() => {
    const ro = new ResizeObserver(() => { last.current = -2; paint(); });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} style={{ width: '100%', height, overflow: 'hidden', position: 'relative' }}>
      <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
