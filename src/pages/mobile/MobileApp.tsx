import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { App } from 'antd';
import { useAppStore } from '../../store';
import { updateAlert } from '../../api/client';
import AlertSheet from './AlertSheet';
import TopAlertBar from './TopAlertBar';
import type { AlertEvent, CsiWebSocketMessage } from '../../types/csi';

/* ── Constants ──────────────────────────────────────────────────── */
const WS_URL = 'ws://127.0.0.1:8000/ws/csi?mode=demo';
const DEMO_SOURCE = 'demo_trigger';
const W = 390;

/* ── Design tokens ──────────────────────────────────────────────────
   Inspired by Apple Health / My Wisdom — medical-grade minimalism. */
type Colors = ReturnType<typeof colors>;

const colors = (dm: boolean) => ({
  /* Surfaces */
  bg:          dm ? '#0B0C0F' : '#F0F1F4',
  card:        dm ? '#15161B' : '#FFFFFF',
  cardMuted:   dm ? '#1C1D22' : '#F7F8FA',
  sheet:       dm ? '#111217' : '#FFFFFF',
  /* Text */
  text:        dm ? '#E4E5E9' : '#1A1B1F',
  secondary:   dm ? '#8A8D98' : '#6F717A',
  muted:       dm ? '#5B5E6A' : '#999BA4',
  /* Accent */
  accent:      dm ? '#2DD4C0' : '#0D9488',
  accentBg:    dm ? 'rgba(45,212,192,0.10)' : 'rgba(13,148,136,0.08)',
  /* Semantic */
  success:     dm ? '#4ADE80' : '#22C55E',
  successBg:   dm ? 'rgba(74,222,128,0.10)' : 'rgba(34,197,94,0.08)',
  danger:      dm ? '#F87171' : '#EF4444',
  dangerBg:    dm ? 'rgba(248,113,113,0.10)' : 'rgba(239,68,68,0.06)',
  warning:     dm ? '#FBBF24' : '#F59E0B',
  warningBg:   dm ? 'rgba(251,191,36,0.10)' : 'rgba(245,158,11,0.08)',
  /* Divider */
  hairline:    dm ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
});

/* ── Shared SVG icons ────────────────────────────────────────────── */
const Icons = {
  bell:   (c: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  person: (c: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  home:   (c: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  sensor: (c: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.7 14.7 0 0 1 0 20"/><path d="M2 12h20"/></svg>`,
  users:  (c: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  gear:   (c: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  alertTriangle: `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  check:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  phone:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.86.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  x:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevronR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};

/* ── Tab config ──────────────────────────────────────────────────── */
type Tab = 'home' | 'sensors' | 'trusted' | 'settings';

/* ── Detect theme: parent doc → store → system ───────────────── */
function useSystemDark(): boolean {
  const storeDark = useAppStore((s) => s.darkMode);
  const read = () => {
    try { if (window.parent !== window) {
      const a = window.parent.document.documentElement.getAttribute('data-theme');
      if (a === 'dark') return true; if (a === 'light') return false;
    } } catch { /* cross‑origin */ }
    const own = document.documentElement.getAttribute('data-theme');
    if (own === 'dark') return true; if (own === 'light') return false;
    if (typeof storeDark === 'boolean') return storeDark;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => { setDark(read()); }, [storeDark]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setDark(read());
    mq.addEventListener('change', fn);
    const iv = window.setInterval(() => setDark(read()), 500);
    return () => { mq.removeEventListener('change', fn); window.clearInterval(iv); };
  }, [storeDark]);
  return dark;
}

/* ═══════════════════════════════════════════════════════════════════
   HOME TAB
   ═══════════════════════════════════════════════════════════════ */
function HomeTab({ c }: { c: Colors }) {
  const msg = useAppStore((s) => s.latestMessage);
  const status = useAppStore((s) => s.backendStatus);

  const timeLabel = useMemo(() => {
    const ts = msg?.frame?.timestamp;
    if (!ts) return null;
    const d = new Date((ts > 1e10 ? ts : ts * 1000));
    const h = d.getHours();
    return `${h < 12 ? '上午' : '下午'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [msg]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div>
      {/* ── Greeting ─────────────────────────────────────────── */}
      <div style={{ padding: '6px 2px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: c.secondary, letterSpacing: -0.3 }}>
          {greeting}，<span style={{ fontSize: 30, fontWeight: 700, color: c.text }}>安娜</span>
        </h1>
      </div>

      {/* ── Wellness Score ───────────────────────────────────── */}
      <div style={{
        background: c.card, borderRadius: 20, padding: '10px',
        marginBottom: 12, textAlign: 'center',
        boxShadow: c.bg === '#0B0C0F'
          ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 16px' }}>
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="42" fill="none" stroke={c.hairline} strokeWidth="6" />
            <circle cx="48" cy="48" r="42" fill="none" stroke={c.success}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`} strokeDashoffset={0}
              transform="rotate(-90 48 48)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: c.text }}>优</span>
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 4 }}>状态良好</div>
        <div style={{ fontSize: 13, color: c.secondary }}>
          {timeLabel ? `最近活动 ${timeLabel}` : '全天无异常'}
        </div>
      </div>

      {/* ── Metric cards ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <StatCard c={c} label="今日步数" value="3,284" unit=" 步" sub="较昨日 +12%" />
        <StatCard c={c} label="活跃时间" value="2.4" unit=" 小时" sub="目标 3h" />
      </div>

      {/* ── Rooms ────────────────────────────────────────────── */}
      <SectionHead c={c} title="房间设备" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <RoomCard c={c} name="客厅" sensor="CSI‑01" active />
        <RoomCard c={c} name="前门" sensor="CSI‑03" active />
      </div>

      {/* ── Monitoring bar ───────────────────────────────────── */}
      <div style={{
        background: c.card, borderRadius: 16, padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: c.bg === '#0B0C0F'
          ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: c.successBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} dangerouslySetInnerHTML={{ __html: Icons.shield }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>持续守护中</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>WiFi CSI 跌倒监测</div>
          </div>
        </div>
        <div style={{
          width: 10, height: 10, borderRadius: 5, background: c.success,
          boxShadow: `0 0 8px ${c.success}40`,
        }} />
      </div>
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────────────────── */
function StatCard({ c, label, value, unit, sub }: { c: Colors; label: string; value: string; unit: string; sub: string }) {
  return (
    <div style={{
      background: c.card, borderRadius: 16, padding: '14px',
      boxShadow: c.bg === '#0B0C0F'
        ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <div style={{ fontSize: 11, color: c.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: c.text, lineHeight: 1, letterSpacing: -0.5 }}>
        {value}<span style={{ fontSize: 13, fontWeight: 400, color: c.secondary }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: c.accent, marginTop: 6, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

/* ── Room card ───────────────────────────────────────────────────── */
function RoomCard({ c, name, sensor, active }: { c: Colors; name: string; sensor: string; active: boolean }) {
  return (
    <div style={{
      background: c.card, borderRadius: 16, padding: '12px 14px',
      boxShadow: c.bg === '#0B0C0F'
        ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, background: c.cardMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 16 }}>🛋</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 11, color: c.muted }}>{sensor}</div>
      <div style={{
        marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 20,
        background: c.successBg, color: c.success,
        fontSize: 10, fontWeight: 600,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 3, background: c.success }} />
        在线
      </div>
    </div>
  );
}

function SectionHead({ c, title }: { c: Colors; title: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: c.text }}>{title}</span>
      <span style={{ fontSize: 13, color: c.accent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
        全部<span dangerouslySetInnerHTML={{ __html: Icons.chevronR }} />
      </span>
    </div>
  );
}

/* ── Placeholder tab ─────────────────────────────────────────────── */
function EmptyTab({ c, icon, title, desc }: { c: Colors; icon: string; title: string; desc: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '100px 40px', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 18, background: c.cardMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }} dangerouslySetInnerHTML={{ __html: icon }} />
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: c.text }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14, color: c.secondary, lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
export default function MobileApp() {
  const sysDark = useSystemDark();
  const { notification } = App.useApp();
  const c = colors(sysDark);

  /* ── WebSocket ────────────────────────────────────────────────── */
  const socketRef = useRef<WebSocket | null>(null);
  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;
    ws.onopen  = () => useAppStore.getState().setWsState('online');
    ws.onerror = () => useAppStore.getState().setWsState('offline');
    ws.onclose = () => { socketRef.current = null; useAppStore.getState().setWsState('offline'); setTimeout(connect, 3000); };
    ws.onmessage = (e) => {
      try {
        const m: CsiWebSocketMessage = JSON.parse(e.data);
        if (m.frame?.source !== DEMO_SOURCE) return;
        useAppStore.getState().setLatestMessage(m);
        if (m.result?.alert) add({
          event_id: m.event_id || `a-${Date.now()}`,
          timestamp: m.frame.timestamp,
          room: m.frame.room,
          device_id: m.frame.device_id,
          predicted_label: m.result.predicted_label,
          confidence: m.result.confidence,
          risk_level: m.result.risk_level,
          handled: false,
          reason: m.result.reason,
          analytics: m.analytics,
          evidence_chain: m.evidence_chain,
        } as AlertEvent);
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { connect(); return () => socketRef.current?.close(); }, [connect]);

  /* ── Alert queue ──────────────────────────────────────────────── */
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const add = useCallback((a: AlertEvent) => {
    setAlerts((p) => p.some((x) => x.event_id === a.event_id) ? p : [...p, a]);
  }, []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showTopCard, setShowTopCard] = useState(true);
  const [loading, setLoading] = useState(false);

  const active = useMemo(
    () => alerts.find((a) => !dismissed.has(a.event_id)) ?? null,
    [alerts, dismissed],
  );
  const unread = alerts.filter((a) => !dismissed.has(a.event_id)).length;

  const dismiss = useCallback(async (id: string) => {
    setLoading(true);
    try { await updateAlert(id, { handled: true }); } catch { /* best-effort */ }
    setDismissed((p) => new Set(p).add(id));
    setShowTopCard(false);
    setLoading(false);
  }, []);

  const emergency = useCallback((a: AlertEvent) => {
    dismiss(a.event_id);
    window.location.href = 'tel:13800000000';
  }, [dismiss]);

  const callToast = useCallback(() => {
    notification.info({ message: '演示模式', description: '实际将拨打紧急联系人', placement: 'top' });
  }, [notification]);

  const expand = useCallback(() => { setShowTopCard(false); setDismissed(new Set()); }, []);
  const topConfirm = useCallback((id: string) => dismiss(id), [dismiss]);

  /* ── Tab ──────────────────────────────────────────────────────── */
  const [tab, setTab] = useState<Tab>('home');

  const TabIcon = useCallback(({ t, active: on }: { t: Tab; active: boolean }) => {
    const stroke = on ? c.accent : c.muted;
    const icons: Record<Tab, string> = {
      home: Icons.home(stroke), sensors: Icons.sensor(stroke),
      trusted: Icons.users(stroke), settings: Icons.gear(stroke),
    };
    return <span dangerouslySetInnerHTML={{ __html: icons[t] }} />;
  }, [c.accent, c.muted]);

  const labels: Record<Tab, string> = { home: '首页', sensors: '传感器', trusted: '信任圈', settings: '设置' };

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="mobile-app" style={{
      width: W, maxWidth: '100vw', height: '100vh', margin: '0 auto',
      background: c.bg, display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      fontFamily: `"SF Pro Display", "IBM Plex Sans SC", "Source Han Sans CN", -apple-system, BlinkMacSystemFont, sans-serif`,
      WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
    }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 12px', background: c.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, zIndex: 20,
      }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: c.text, letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/fall.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          吾家智护
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span dangerouslySetInnerHTML={{ __html: Icons.bell(c.text) }} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 0, right: 2,
                minWidth: 16, height: 16, borderRadius: 8,
                background: c.danger, color: '#FFF', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: 17,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF', fontSize: 14, fontWeight: 600,
          }}>A</div>
        </div>
      </div>

      {/* ── Banner ─────────────────────────────────────────────── */}
      {useAppStore((s) => s.apiState) === 'offline' && (
        <div style={{
          margin: '0 14px 8px', padding: '8px 14px', borderRadius: 10,
          background: c.warningBg, color: c.warning,
          fontSize: 12, textAlign: 'center', fontWeight: 500,
        }}>后端服务未连接</div>
      )}

      {/* ── Top alert card ─────────────────────────────────────── */}
      {showTopCard && active && !loading && (
        <TopAlertBar alert={active} c={c} onConfirm={topConfirm} onExpand={expand} />
      )}

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '0 14px',
        paddingBottom: 84, scrollbarWidth: 'none',
      }}>
        {tab === 'home'     && <HomeTab c={c} />}
        {tab === 'sensors'  && <EmptyTab c={c} icon={Icons.sensor(c.accent)} title="传感器管理" desc="管理所有 WiFi CSI 传感器节点，查看实时信号与状态" />}
        {tab === 'trusted'  && <EmptyTab c={c} icon={Icons.users(c.accent)} title="信任圈" desc="跌倒告警时自动通知家人与看护人员" />}
        {tab === 'settings' && <EmptyTab c={c} icon={Icons.gear(c.accent)} title="系统设置" desc="通知偏好、传感器灵敏度等系统参数" />}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', background: c.bg,
        borderTop: `1px solid ${c.hairline}`,
        paddingBottom: 'max(env(safe-area-inset-bottom, 6px), 6px)',
        paddingTop: 4, zIndex: 20,
      }}>
        {(['home', 'sensors', 'trusted', 'settings'] as Tab[]).map((t) => {
          const on = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              padding: '6px 0 2px', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: on ? 1 : 0.4, transition: 'opacity 0.2s',
              touchAction: 'manipulation', minHeight: 48,
              WebkitTapHighlightColor: 'transparent',
            }}>
              <TabIcon t={t} active={on} />
              <span style={{ fontSize: 10, fontWeight: on ? 600 : 400, color: on ? c.accent : c.muted }}>
                {labels[t]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Alert sheet ────────────────────────────────────────── */}
      <AlertSheet
        alert={active}
        visible={!!active && !loading}
        onDismiss={dismiss}
        onEmergency={emergency}
        onCall={callToast}
        c={c}
      />
    </div>
  );
}
