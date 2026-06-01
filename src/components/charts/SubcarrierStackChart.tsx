import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store';

interface Props { height?: number; highlightFrameId?: number | null; data?: { subcarrier_amplitudes?: number[]; frame_id?: number }[] | null }

const MAX = 200, SC = 30;
const ML = 50, MR = 14, MT = 10, MB = 30;

export default function SubcarrierStackChart({ height = 240, highlightFrameId, data }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const ah = useAppStore(s => s.analyticsHistory);
  const storeHistory = useAppStore(s => s.analyticsHistory);
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

    const recent = (data ?? storeHistory).slice(-MAX);
    const N = recent.length;
    if (N === 0) return;
    const lf = recent[N - 1]?.frame_id ?? -1;
    if (N === prevN.current && lf === last.current && !data) return;
    prevN.current = N; last.current = lf;

    let yMin = Infinity, yMax = -Infinity;
    for (const e of recent) {
      const amps = e?.subcarrier_amplitudes;
      if (!amps) continue;
      for (let i = 0; i < Math.min(amps.length, SC); i++) {
        if (amps[i] < yMin) yMin = amps[i];
        if (amps[i] > yMax) yMax = amps[i];
      }
    }
    if (yMax - yMin < 0.001) { yMin -= 0.01; yMax += 0.01; }

    const px = W - ML - MR, py = H - MT - MB;
    if (px <= 0 || py <= 0) return;

    // BG
    ctx.fillStyle = dm ? 'rgba(10,14,24,0.3)' : 'rgba(248,250,252,0.3)';
    ctx.fillRect(ML, MT, px, py);

    const tx = dm ? '#aabbcc' : '#556677';
    const lc = dm ? '#3a4a5a' : '#ccdddd';

    // Draw 30 lines
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let sc = 0; sc < SC; sc++) {
      const hue = (sc / SC) * 0.7 + 0.55;
      const sat = 0.6, lit = dm ? 0.48 : 0.38;
      const a = sat * Math.min(lit, 1 - lit);
      const f = (n: number) => { const k = (n + hue * 12) % 12; return lit - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
      ctx.strokeStyle = `rgb(${Math.round(f(0)*255)},${Math.round(f(8)*255)},${Math.round(f(4)*255)})`;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const amps = recent[i]?.subcarrier_amplitudes;
        const v = (amps && sc < amps.length) ? amps[sc] : 0;
        const x = ML + (i / (N - 1 || 1)) * px;
        const y = MT + (1 - (v - yMin) / (yMax - yMin)) * py;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Axes
    ctx.strokeStyle = lc; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(ML - 0.5, MT); ctx.lineTo(ML - 0.5, MT + py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ML, MT + py + 0.5); ctx.lineTo(ML + px, MT + py + 0.5); ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = tx; ctx.font = '9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const v = yMin + (yMax - yMin) * i / ySteps;
      const y = MT + py - (i / ySteps) * py;
      ctx.fillText(v.toFixed(3), ML - 6, y);
    }
    // Y-axis label (vertical)
    ctx.save();
    ctx.translate(12, MT + py / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('幅度', 0, 0);
    ctx.restore();

    // X-axis labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xSteps = Math.min(5, Math.floor(N / 20));
    for (let i = 0; i < N; i += Math.max(1, Math.floor(N / xSteps))) {
      ctx.fillText(`T-${N - 1 - i}`, ML + (i / (N - 1 || 1)) * px, MT + py + 6);
    }
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

  useEffect(() => { paint(); }, data ? [data, highlightFrameId] : undefined);
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
