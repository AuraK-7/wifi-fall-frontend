import { useState, useCallback, useEffect } from 'react';
import { getEventReplay } from '../../api/client';
import RF3DScene, {
  type ReplayData, type PlaybackState,
} from '../../components/visualization/RF3DScene';
import type { AlertEvent, EventReplayResponse } from '../../types/csi';

/* ── Types ──────────────────────────────────────────────────────── */
interface Colors {
  bg: string; card: string; cardMuted: string; sheet: string;
  text: string; secondary: string; muted: string;
  accent: string; accentBg: string;
  success: string; successBg: string;
  danger: string; dangerBg: string;
  warning: string; warningBg: string;
  hairline: string;
}

interface Props {
  alert: AlertEvent | null;
  visible: boolean;
  onDismiss: (id: string) => void;
  onEmergency: (a: AlertEvent) => void;
  onCall: (phone: string) => void;
  c: Colors;
}

/* ── Helpers ────────────────────────────────────────────────────── */
const ROOM: Record<string, string> = {
  home: '客厅传感器', home_lab_left: '客厅传感器', home_lab_right: '客厅传感器',
  living_room: '客厅传感器', lecture_room: '卧室传感器', meeting_room: '前门传感器',
  room_1: '大厅传感器', real_room: '大厅传感器', demo: '客厅传感器',
};
function rl(room: string) { return ROOM[room?.toLowerCase()] || `${room}传感器`; }
function ft(ts: number | string) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date((ts > 1e10 ? ts : ts * 1000));
  if (isNaN(d.getTime())) return String(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── SVG ────────────────────────────────────────────────────────── */
const S = {
  alert: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.86.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sos: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
};

/* ═════════════════════════════════════════════════════════════════
   ALERT SHEET
   ═════════════════════════════════════════════════════════════════ */
export default function AlertSheet({ alert, visible, onDismiss, onEmergency, onCall, c }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [slide, setSlide] = useState(false);

  // ── 3D replay data ──────────────────────────────────────────
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    playing: true, speed: 1, currentFrame: 0, loop: true, phase: 'normal',
  });

  useEffect(() => {
    if (visible && alert?.event_id) {
      setReplayLoading(true);
      getEventReplay(alert.event_id)
        .then((data: EventReplayResponse) => {
          setReplayData({
            event_id: data.event_id,
            windows: data.windows.map((w) => ({
              ...w,
              avatar: null,
            })),
            start_window_index: data.start_window_index,
            centre_window_index: data.centre_window_index,
          });
          setPlayback((p) => ({ ...p, playing: true, currentFrame: 0 }));
          setReplayLoading(false);
        })
        .catch(() => setReplayLoading(false));
    } else {
      setReplayData(null);
    }
  }, [visible, alert?.event_id]);

  const fallFrameIndex = replayData
    ? replayData.windows.findIndex((w) => w.label === 'fall')
    : 90;

  // ── Playback timer ──────────────────────────────────────────
  useEffect(() => {
    if (!playback.playing || !replayData) return;
    const total = replayData.windows.length;
    const id = window.setInterval(() => {
      setPlayback((p) => {
        const n = p.currentFrame + 1 >= total ? 0 : p.currentFrame + 1;
        return { ...p, currentFrame: n };
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [playback.playing, replayData]);

  // ── Sheet animation ─────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => setSlide(true));
    } else {
      document.body.style.overflow = '';
      setSlide(false);
    }
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  const dismiss = useCallback(() => { if (alert?.event_id) onDismiss(alert.event_id); }, [alert, onDismiss]);

  if (!visible || !alert) return null;

  const conf = alert.confidence ? `${(alert.confidence * 100).toFixed(0)}%` : '--';
  const totalFrames = replayData?.windows.length ?? 0;
  const isDark = c.bg === '#0B0C0F';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={dismiss} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
        opacity: slide ? 1 : 0, transition: 'opacity 0.3s',
      }} />

      {/* Sheet */}
      <div style={{
        position: 'relative', maxHeight: '92vh',
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        background: c.sheet, overflow: 'auto',
        transform: slide ? 'translateY(0)' : 'translateY(15%)',
        transition: 'transform 0.32s cubic-bezier(0.21, 1.02, 0.38, 1)',
        boxShadow: '0 -6px 28px rgba(0,0,0,0.15)',
        scrollbarWidth: 'none',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: c.hairline }} />
        </div>

        {/* ── Alert header (icon + text inline) ──────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px 14px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24, background: c.dangerBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: c.danger,
            animation: 'alert-pulse 2s ease-in-out infinite',
          }} dangerouslySetInnerHTML={{ __html: S.alert }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: c.text, letterSpacing: -0.3 }}>
              检测到可能跌倒
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: c.secondary }}>请确认老人状态</p>
          </div>
        </div>

        {/* ── 3D Replay ─────────────────────────────────────── */}
        <div style={{ margin: '0 16px 12px', borderRadius: 14, overflow: 'hidden', height: 215, background: '#0B0E14', position: 'relative' }}>
          {replayLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
              <div className="loading-spinner" />
            </div>
          )}
          {replayData ? (
            <RF3DScene
              replayData={replayData}
              playback={playback}
              darkMode={isDark}
              liveAvatar={null}
              fallFrameIndex={fallFrameIndex >= 0 ? fallFrameIndex : Math.floor(totalFrames * 0.65)}
              onFrameChange={(f) => setPlayback((p) => p.currentFrame !== f ? { ...p, currentFrame: f } : p)}
            />
          ) : null}

          {/* Playback controls overlay */}
          {replayData && totalFrames > 0 && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
              padding: '20px 8px 8px', zIndex: 3,
            }}>
              <input type="range" min={0} max={totalFrames - 1} value={playback.currentFrame}
                onChange={(e) => setPlayback((p) => ({ ...p, currentFrame: Number(e.target.value), playing: false }))}
                style={{ width: '100%', height: 4, margin: 0, padding: 0, WebkitAppearance: 'none', appearance: 'none',
                  borderRadius: 2, outline: 'none', cursor: 'pointer',
                  background: `linear-gradient(to right, #4aa8ff ${(playback.currentFrame / (totalFrames - 1)) * 100}%, rgba(255,255,255,0.15) ${(playback.currentFrame / (totalFrames - 1)) * 100}%)` }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
                <button onClick={() => setPlayback((p) => ({ ...p, playing: !p.playing }))}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '50%', color: '#fff', fontSize: 16, width: 34, height: 34,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'manipulation' }}>
                  {playback.playing ? '⏸' : '▶'}
                </button>
                <span style={{ color: '#8899aa', fontSize: 10, fontFamily: 'monospace', minWidth: 60, textAlign: 'center' }}>
                  {playback.currentFrame + 1} / {totalFrames}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Elder info card ────────────────────────────────── */}
        <div style={{ margin: '0 16px 14px', background: c.cardMuted, borderRadius: 16, padding: '16px' }}>
          <Row c={c} label="老人" value="安妮特·迈尔斯" avatar />
          <Row c={c} label="传感器" value={rl(alert.room || '')} dot={c.success} />
          <Row c={c} label="日期" value={ft(alert.timestamp)} />
          <Row c={c} label="置信度" value={conf} last accent={alert.confidence > 0.85 ? c.danger : c.success} />
        </div>

        {/* ── Actions ────────────────────────────────────────── */}
        <div style={{ padding: '0 16px 24px' }}>
          <button onClick={() => onCall('13800000000')} style={btn(c, false)}>
            <span dangerouslySetInnerHTML={{ __html: S.phone }} style={{ display: 'flex', marginRight: 8 }} />
            按下通话
          </button>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={dismiss} style={{ ...btn(c, false), flex: 1, background: c.successBg, color: c.success, border: 'none' }}>
              <span dangerouslySetInnerHTML={{ __html: S.check }} style={{ display: 'flex', marginRight: 6 }} />确认安全
            </button>
            <button onClick={() => setConfirm(true)} style={{ ...btn(c, false), flex: 1, background: c.danger, color: '#FFF', border: 'none' }}>
              <span dangerouslySetInnerHTML={{ __html: S.x }} style={{ display: 'flex', marginRight: 6 }} />紧急求助
            </button>
          </div>
        </div>

        {/* ── Confirm dialog ────────────────────────────────── */}
        {confirm && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)', borderRadius: 22, zIndex: 10,
          }}>
            <div style={{ background: c.card, borderRadius: 18, padding: '26px 22px', textAlign: 'center', maxWidth: 280, width: '88%', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ color: c.danger, marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: S.sos }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 17, color: c.danger, fontWeight: 700 }}>确认紧急求助</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: c.secondary, lineHeight: 1.6 }}>
                将立即拨打<br /><b style={{ color: c.text }}>138-0000-0000</b>
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirm(false)} style={dialogBtn(c)}>取消</button>
                <button onClick={() => { setConfirm(false); if (alert) onEmergency(alert); }}
                  style={{ ...dialogBtn(c), background: c.danger, color: '#FFF', border: 'none' }}>确认拨打</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Row ────────────────────────────────────────────────────────── */
function Row({ c, label, value, dot, avatar, last, accent }: {
  c: Colors; label: string; value: string; dot?: string; avatar?: boolean; last?: boolean; accent?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: last ? 0 : 11, marginBottom: last ? 0 : 11,
      borderBottom: last ? 'none' : `1px solid ${c.hairline}`,
    }}>
      <span style={{ fontSize: 13, color: c.muted, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: 4, background: dot }} />}
        {avatar && <div style={{ width: 28, height: 28, borderRadius: 14, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 12, fontWeight: 600 }}>A</div>}
        <span style={{ fontSize: 14, fontWeight: 600, color: accent || c.text }}>{value}</span>
      </div>
    </div>
  );
}

/* ── Button ─────────────────────────────────────────────────────── */
function btn(c: Colors, small: boolean) {
  return {
    width: '100%', padding: small ? '10px 0' : '16px 0',
    borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${c.hairline}`, background: c.cardMuted, color: c.text,
    outline: 'none', touchAction: 'manipulation' as const,
    minHeight: small ? 42 : 52, transition: 'opacity 0.15s',
  };
}

/* Dialog buttons — side‑by‑side, no 100% width */
function dialogBtn(c: Colors) {
  return {
    flex: 1, padding: '11px 0', borderRadius: 14, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${c.hairline}`, background: c.cardMuted, color: c.text,
    outline: 'none', touchAction: 'manipulation' as const,
    minHeight: 44, transition: 'opacity 0.15s',
  };
}
