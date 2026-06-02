import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store';

interface Props { height?: number; highlightFrameId?: number | null }

const R = 120, C = 128, FL = -80;
const ML = 48, MR = 14, MT = 10, MB = 40;

function rgb(db: number, lo: number, hi: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (db - lo) / (hi - lo || 1)));
  const h = (1 - t) * 0.66, s = 0.85, l = 0.22 + t * 0.40;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export default function MicroDopplerChart({ height = 240, highlightFrameId }: Props) {
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
    if (c.width !== Math.round(W * dp) || c.height !== Math.round(H * dp)) {
      c.width = Math.round(W * dp); c.height = Math.round(H * dp);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dp, 0, 0, dp, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const recent = ah.slice(-R);
    const N = recent.length;
    if (N === 0) return;
    const lf = recent[N - 1]?.frame_id ?? -1;
    if (N === prevN.current && lf === last.current) return;
    prevN.current = N; last.current = lf;

    let lo = FL, hi = 0;
    for (const e of recent) {
      const s = e?.micro_doppler_spectrum;
      if (!s) continue;
      for (let i = 0; i < Math.min(s.length, C); i++) {
        if (s[i] < lo) lo = s[i]; if (s[i] > hi) hi = s[i];
      }
    }
    if (hi - lo < 0.5) hi = lo + 0.5;

    const px = W - ML - MR, py = H - MT - MB;
    if (px <= 0 || py <= 0) return;

    // Semi-transparent bg — same as other charts
    ctx.fillStyle = dm ? 'rgba(10,14,24,0.3)' : 'rgba(248,250,252,0.3)';
    ctx.fillRect(ML, MT, px, py);

    // Build ImageData — empty cells get alpha=0 (transparent)
    const img = ctx.createImageData(C, R);
    const off = R - N;
    for (let r = 0; r < R; r++) {
      const hIdx = r - off;
      const spec = hIdx >= 0 ? recent[hIdx]?.micro_doppler_spectrum : null;
      const hasData = spec && spec.length > 0;
      for (let c = 0; c < C; c++) {
        const ii = (r * C + c) * 4;
        if (hasData && c < spec.length) {
          const [rr, gg, bb] = rgb(spec[c], lo, hi);
          img.data[ii] = rr; img.data[ii + 1] = gg; img.data[ii + 2] = bb; img.data[ii + 3] = 255;
        } else {
          img.data[ii] = 0; img.data[ii + 1] = 0; img.data[ii + 2] = 0; img.data[ii + 3] = 0; // transparent
        }
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = C; tmp.height = R;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, ML, MT, px, py);

    const tx = dm ? '#aabbcc' : '#556677';
    const lc = dm ? '#3a4a5a' : '#ccdddd';
    const ff = '"IBM Plex Mono", "Consolas", monospace';
    ctx.lineWidth = 0.5;

    // Y-axis
    ctx.strokeStyle = lc;
    ctx.beginPath(); ctx.moveTo(ML - 0.5, MT); ctx.lineTo(ML - 0.5, MT + py); ctx.stroke();
    ctx.fillStyle = tx; ctx.font = `9px ${ff}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let r = 0; r < R; r += 20) {
      ctx.fillText(`T-${R - 1 - r}`, ML - 6, MT + (r + 0.5) * py / R);
    }
    ctx.save();
    ctx.translate(10, MT + py / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('时间帧', 0, 0);
    ctx.restore();

    // X-axis
    ctx.strokeStyle = lc;
    ctx.beginPath(); ctx.moveTo(ML, MT + py + 0.5); ctx.lineTo(ML + px, MT + py + 0.5); ctx.stroke();
    ctx.fillStyle = tx; ctx.font = `9px ${ff}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let c = 0; c <= C; c += 16) {
      ctx.fillText((c / C * 50).toFixed(0), ML + c / C * px, MT + py + 6);
    }
    ctx.fillText('频率 (Hz)', ML + px / 2, MT + py + 18);

    // dB legend
    const lw = Math.min(140, px * 0.55), lx = ML + (px - lw) / 2, ly = H - 8;
    for (let i = 0; i < lw; i++) {
      const v = lo + i / lw * (hi - lo);
      const [rr, gg, bb] = rgb(v, lo, hi);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(lx + i, ly - 5, 1, 6);
    }
    ctx.textBaseline = 'bottom'; ctx.fillStyle = tx; ctx.font = `8px ${ff}`;
    ctx.textAlign = 'left'; ctx.fillText(`${lo.toFixed(0)} dB`, lx, ly - 6);
    ctx.textAlign = 'right'; ctx.fillText(`${hi.toFixed(0)} dB`, lx + lw, ly - 6);

    // Highlight
    if (highlightFrameId != null) {
      const idx = recent.findIndex(e => e.frame_id === highlightFrameId);
      if (idx >= 0) {
        const y = MT + (off + idx + 0.5) * py / R;
        ctx.strokeStyle = 'rgba(255,68,68,0.85)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + px, y); ctx.stroke();
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
    <div ref={wrap} style={{ width: '100%', height, overflow: 'hidden' }}>
      <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
