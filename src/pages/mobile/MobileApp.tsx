import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { App } from 'antd';
import { useAppStore } from '../../store';
import { getAlerts, updateAlert } from '../../api/client';
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
  plus:   (c: string) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash:  (c: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  back:   (c: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  wifi:   (c: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  moon:   (c: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:    (c: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

/* ── Tab config ──────────────────────────────────────────────────── */
type Tab = 'home' | 'sensors' | 'trusted' | 'settings';
type View = 'main' | 'alerts' | 'profile';

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
function HomeTab({ c, alert, showTopCard, loading, onConfirm, onExpand }: {
  c: Colors;
  alert: AlertEvent | null;
  showTopCard: boolean;
  loading: boolean;
  onConfirm: (id: string) => void;
  onExpand: (a: AlertEvent) => void;
}) {
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
      {/* ── Greeting / Alert ─────────────────────────────────── */}
      {showTopCard && alert && !loading ? (
        <TopAlertBar alert={alert} c={c} onConfirm={onConfirm} onExpand={onExpand} />
      ) : (
        <div style={{ padding: '6px 2px 16px' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: c.secondary, letterSpacing: -0.3 }}>
            {greeting}，<span style={{ fontSize: 30, fontWeight: 700, color: c.text }}>安娜</span>
          </h1>
        </div>
      )}

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

/* ═══════════════════════════════════════════════════════════════════
   SENSORS TAB
   ═══════════════════════════════════════════════════════════════════ */
interface SensorNode { id: string; name: string; room: string; mac: string; signal: number; lastSeen: string; online: boolean; firmware: string; }
const MOCK_SENSORS: SensorNode[] = [
  { id: 'csi-01', name: 'CSI‑01', room: '客厅', mac: 'AA:BB:CC:11:22:33', signal: 82, lastSeen: '刚刚', online: true, firmware: 'v2.4.1' },
  { id: 'csi-03', name: 'CSI‑03', room: '前门', mac: 'AA:BB:CC:11:22:55', signal: 67, lastSeen: '刚刚', online: true, firmware: 'v2.4.1' },
  { id: 'csi-04', name: 'CSI‑04', room: '卧室', mac: 'AA:BB:CC:11:22:66', signal: 74, lastSeen: '2 分钟前', online: true, firmware: 'v2.4.0' },
  { id: 'csi-02', name: 'CSI‑02', room: '厨房', mac: 'AA:BB:CC:11:22:44', signal: 0, lastSeen: '2 小时前', online: false, firmware: 'v2.3.1' },
];

function SensorsTab({ c }: { c: Colors }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((p) => (p === id ? null : id));

  return (
    <div>
      <div style={{ padding: '6px 2px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: c.secondary, letterSpacing: -0.3 }}>
          传感器
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: c.muted }}>{MOCK_SENSORS.filter((s) => s.online).length} 台在线 · 共 {MOCK_SENSORS.length} 台</p>
      </div>

      {MOCK_SENSORS.map((s) => {
        const open = expanded === s.id;
        return (
          <div key={s.id} onClick={() => toggle(s.id)} style={{
            background: c.card, borderRadius: 16, padding: '14px 16px',
            marginBottom: 10, cursor: 'pointer', touchAction: 'manipulation',
            boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
            transition: 'box-shadow 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 13,
                background: s.online ? c.successBg : c.dangerBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }} dangerouslySetInnerHTML={{ __html: Icons.wifi(s.online ? c.success : c.danger) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{s.name}</span>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: s.online ? c.success : c.muted,
                    boxShadow: s.online ? `0 0 6px ${c.success}60` : 'none',
                  }} />
                  <span style={{ fontSize: 11, color: c.muted }}>{s.room}</span>
                </div>
                <div style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                  {s.online ? `信号 ${s.signal}%` : '离线'} · {s.lastSeen}
                </div>
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: s.online ? c.successBg : c.dangerBg,
                color: s.online ? c.success : c.danger,
              }}>{s.online ? '在线' : '离线'}</span>
              <span dangerouslySetInnerHTML={{ __html: Icons.chevronR }}
                style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'flex' }} />
            </div>

            {open && (
              <div style={{
                marginTop: 14, paddingTop: 14,
                borderTop: `1px solid ${c.hairline}`,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  <DetailRow c={c} label="MAC 地址" value={s.mac} />
                  <DetailRow c={c} label="固件版本" value={s.firmware} />
                  <DetailRow c={c} label="房间" value={s.room} />
                  <DetailRow c={c} label="最后上报" value={s.lastSeen} />
                </div>
                {s.online && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: c.muted, marginBottom: 6 }}>信号强度</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: c.cardMuted, overflow: 'hidden' }}>
                        <div style={{ width: `${s.signal}%`, height: '100%', borderRadius: 3,
                          background: s.signal > 70 ? c.success : s.signal > 30 ? c.warning : c.danger,
                          transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.text, minWidth: 36, textAlign: 'right' }}>{s.signal}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ c, label, value }: { c: Colors; label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: c.text, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TRUSTED TAB
   ═══════════════════════════════════════════════════════════════════ */
interface Contact { id: string; name: string; phone: string; relation: string; avatarColor: string; priority: number; }
const RELATIONS = ['配偶', '子女', '父母', '兄弟姐妹', '邻居', '看护人员', '其他'];

function TrustedTab({ c, notify }: { c: Colors; notify: (msg: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([
    { id: 'c1', name: '张伟', phone: '139-0000-1234', relation: '配偶', avatarColor: '#667eea', priority: 1 },
    { id: 'c2', name: '安娜·李', phone: '139-0000-5678', relation: '子女', avatarColor: '#f59e0b', priority: 2 },
    { id: 'c3', name: '王医生', phone: '139-0000-9012', relation: '看护人员', avatarColor: '#22c55e', priority: 3 },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', relation: '子女' });

  const openAdd = () => { setEditId(null); setForm({ name: '', phone: '', relation: '子女' }); setShowForm(true); };
  const openEdit = (con: Contact) => { setEditId(con.id); setForm({ name: con.name, phone: con.phone, relation: con.relation }); setShowForm(true); };
  const save = () => {
    if (!form.name.trim() || !form.phone.trim()) { notify('请填写姓名和电话'); return; }
    if (editId) {
      setContacts((p) => p.map((x) => (x.id === editId ? { ...x, ...form } : x)));
      notify('联系人已更新');
    } else {
      const nc: Contact = { id: `c-${Date.now()}`, ...form, avatarColor: ['#667eea','#f59e0b','#22c55e','#ef4444','#8b5cf6'][Math.floor(Math.random() * 5)], priority: contacts.length + 1 };
      setContacts((p) => [...p, nc]);
      notify('联系人已添加');
    }
    setShowForm(false);
  };
  const remove = (id: string) => { setContacts((p) => p.filter((x) => x.id !== id)); notify('联系人已移除'); };

  return (
    <div>
      <div style={{ padding: '6px 2px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: c.secondary, letterSpacing: -0.3 }}>
            信任圈
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: c.muted }}>{contacts.length} 位紧急联系人</p>
        </div>
        <button onClick={openAdd} style={{
          width: 36, height: 36, borderRadius: 12, border: 'none',
          background: c.accentBg, color: c.accent, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }} dangerouslySetInnerHTML={{ __html: Icons.plus(c.accent) }} />
      </div>

      {/* ── Emergency priority hint ──────────────────────────────── */}
      <div style={{
        background: c.warningBg, borderRadius: 12, padding: '10px 14px',
        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 11, color: c.warning,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
        跌倒告警时按优先级顺序依次通知，未响应则顺延
      </div>

      {contacts
        .sort((a, b) => a.priority - b.priority)
        .map((con, idx) => (
          <div key={con.id} onClick={() => openEdit(con)} style={{
            background: c.card, borderRadius: 16, padding: '12px 14px',
            marginBottom: 10, cursor: 'pointer', touchAction: 'manipulation',
            boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              position: 'relative', flexShrink: 0,
              width: 10, height: 10, borderRadius: 5,
              background: idx === 0 ? c.danger : idx === 1 ? c.warning : c.muted,
            }}>
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: 20, flexShrink: 0,
              background: `linear-gradient(135deg, ${con.avatarColor}, ${con.avatarColor}dd)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFF', fontSize: 15, fontWeight: 700,
            }}>{con.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{con.name}</span>
                <span style={{ fontSize: 10, color: c.muted, background: c.cardMuted, padding: '2px 8px', borderRadius: 10 }}>{con.relation}</span>
              </div>
              <div style={{ fontSize: 12, color: c.accent, marginTop: 3 }}>{con.phone}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); remove(con.id); }} style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0.3, touchAction: 'manipulation',
            }} dangerouslySetInnerHTML={{ __html: Icons.trash(c.danger) }} />
          </div>
        ))}

      {/* ── Add / Edit Modal ────────────────────────────────────── */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: W, background: c.sheet,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            padding: '20px 18px 28px', boxShadow: '0 -6px 28px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 32, height: 4, borderRadius: 2, background: c.hairline }} />
            </div>
            <h3 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: c.text }}>
              {editId ? '编辑联系人' : '添加联系人'}
            </h3>
            {(['name', 'phone'] as const).map((field) => (
              <div key={field} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>{field === 'name' ? '姓名' : '电话'}</div>
                <input value={form[field]} onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                  placeholder={field === 'name' ? '联系人姓名' : '手机号码'}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12,
                    border: `1px solid ${c.hairline}`, background: c.cardMuted, color: c.text,
                    fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }} />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>关系</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {RELATIONS.map((r) => (
                  <button key={r} onClick={() => setForm((p) => ({ ...p, relation: r }))} style={{
                    padding: '8px 14px', borderRadius: 20, border: form.relation === r ? `1px solid ${c.accent}` : `1px solid ${c.hairline}`,
                    background: form.relation === r ? c.accentBg : 'transparent',
                    color: form.relation === r ? c.accent : c.secondary,
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    touchAction: 'manipulation',
                  }}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={dialogBtn(c)}>取消</button>
              <button onClick={save} style={{ ...dialogBtn(c), background: c.accent, color: '#FFF', border: 'none' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════════════════════════════ */
function SettingsTab({ c, dark, notify }: { c: Colors; dark: boolean; notify: (msg: string) => void }) {
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const muted = useAppStore((s) => s.muted);
  const setMuted = useAppStore((s) => s.setMuted);

  const [pushOn, setPushOn] = useState(true);
  const [vibrationOn, setVibrationOn] = useState(true);
  const [sensitivity, setSensitivity] = useState(2); // 0=低 1=中 2=高

  return (
    <div>
      <div style={{ padding: '6px 2px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: c.secondary, letterSpacing: -0.3 }}>
          系统设置
        </h1>
      </div>

      {/* ── Notifications ──────────────────────────────────────── */}
      <SectionLabel c={c} text="通知" />
      <div style={{
        background: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
        boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <ToggleRow c={c} label="推送通知" sub="跌倒告警即时推送" checked={pushOn} onChange={setPushOn} />
        <ToggleRow c={c} label="声音提醒" sub="告警时播放提示音" checked={!muted} onChange={(v) => setMuted(!v)} last={false} />
        <ToggleRow c={c} label="振动" sub="告警时设备振动" checked={vibrationOn} onChange={setVibrationOn} last />
      </div>

      {/* ── Monitoring ────────────────────────────────────────── */}
      <SectionLabel c={c} text="监测" />
      <div style={{
        background: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
        boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>跌倒检测灵敏度</div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>
                {['较低 — 减少误报', '适中 — 平衡模式', '较高 — 更加灵敏'][sensitivity]}
              </div>
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700, color: c.accent,
              background: c.accentBg, padding: '4px 12px', borderRadius: 10,
            }}>{['低', '中', '高'][sensitivity]}</span>
          </div>
          <input type="range" min={0} max={2} step={1} value={sensitivity}
            onChange={(e) => { setSensitivity(Number(e.target.value)); notify(`灵敏度已设为${['低','中','高'][Number(e.target.value)]}`); }}
            style={{ width: '100%', height: 4, margin: 0, padding: 0, WebkitAppearance: 'none', appearance: 'none',
              borderRadius: 2, outline: 'none', cursor: 'pointer',
              background: `linear-gradient(to right, ${c.accent} ${(sensitivity / 2) * 100}%, ${c.hairline} ${(sensitivity / 2) * 100}%)` }} />
        </div>
      </div>

      {/* ── Appearance ───────────────────────────────────────────── */}
      <SectionLabel c={c} text="外观" />
      <div style={{
        background: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
        boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <button onClick={() => {
          const newVal = !dark;
          setDarkMode(newVal);
          // 同步更新父窗口 data-theme，确保 iframe 内 useSystemDark 立即生效
          try { window.parent.document.documentElement.setAttribute('data-theme', newVal ? 'dark' : 'light'); } catch {}
          document.documentElement.setAttribute('data-theme', newVal ? 'dark' : 'light');
          notify(newVal ? '已切换为深色模式' : '已切换为浅色模式');
        }} style={{
          width: '100%', padding: '14px 16px', border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12, background: c.cardMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} dangerouslySetInnerHTML={{ __html: dark ? Icons.moon(c.accent) : Icons.sun(c.warning) }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>深色模式</div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{dark ? '已开启' : '已关闭'}</div>
            </div>
          </div>
          <span style={{
            width: 20, height: 20, borderRadius: 10,
            background: dark ? c.accent : c.hairline,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s', flexShrink: 0,
          }}>
            {dark && <span style={{ color: '#FFF', fontSize: 10 }}>✓</span>}
          </span>
        </button>
      </div>

      {/* ── About ─────────────────────────────────────────────────── */}
      <SectionLabel c={c} text="关于" />
      <div style={{
        background: c.card, borderRadius: 16, overflow: 'hidden',
        boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <InfoRow c={c} label="应用版本" value="1.2.0" />
        <InfoRow c={c} label="检测模型" value="CNN2D + EfficientNet-B0" last={false} />
        <InfoRow c={c} label="CSI 协议" value="WiFi 802.11n 5GHz" last />
      </div>
      <div style={{ textAlign: 'center', padding: '20px 0 8px', fontSize: 11, color: c.muted }}>
        吾家智护 · WiFi Fall Guard © 2026
      </div>
    </div>
  );
}

/* ── Settings sub-components ─────────────────────────────────────── */
function SectionLabel({ c, text }: { c: Colors; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>{text}</div>;
}

function ToggleRow({ c, label, sub, checked, onChange, last }: { c: Colors; label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: '100%', padding: '14px 16px', border: 'none', borderBottom: last ? 'none' : `1px solid ${c.hairline}`,
      background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', textAlign: 'left',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{label}</div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0, marginLeft: 12,
        background: checked ? c.accent : c.cardMuted, transition: 'background 0.2s',
        display: 'flex', alignItems: 'center', padding: '0 3px',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10,
          background: '#FFF', transition: 'transform 0.2s',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </div>
    </button>
  );
}

function InfoRow({ c, label, value, last }: { c: Colors; label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 16px', borderBottom: last ? 'none' : `1px solid ${c.hairline}`,
    }}>
      <span style={{ fontSize: 14, color: c.text }}>{label}</span>
      <span style={{ fontSize: 13, color: c.muted, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function dialogBtn(c: Colors) {
  return {
    flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${c.hairline}`, background: c.cardMuted, color: c.text,
    outline: 'none', touchAction: 'manipulation' as const,
    minHeight: 48, transition: 'opacity 0.15s',
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ALERT HISTORY VIEW  (bell → full-screen slide-in)
   ═══════════════════════════════════════════════════════════════════ */
function AlertHistoryView({ c, alerts, dismissed, onDismiss, onViewAlert }: {
  c: Colors;
  alerts: AlertEvent[];
  dismissed: Set<string>;
  onBack: () => void;
  onDismiss: (id: string) => void;
  onViewAlert: (a: AlertEvent) => void;
}) {
  const sorted = useMemo(() => [...alerts].sort((a, b) => {
    const ta = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : (a.timestamp > 1e10 ? a.timestamp : a.timestamp * 1000);
    const tb = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : (b.timestamp > 1e10 ? b.timestamp : b.timestamp * 1000);
    return tb - ta;
  }), [alerts]);

  const allHandled = alerts.length > 0 && alerts.every((a) => dismissed.has(a.event_id));
  const markAllRead = () => alerts.forEach((a) => onDismiss(a.event_id));

  if (alerts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 40px 40px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: c.cardMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }} dangerouslySetInnerHTML={{ __html: Icons.bell(c.muted) }} />
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: c.text }}>暂无告警</h3>
        <p style={{ margin: 0, fontSize: 13, color: c.muted }}>系统运行正常，未检测到跌倒事件</p>
      </div>
    );
  }

  return (
    <div>
      {!allHandled && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={markAllRead} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none',
            background: c.accentBg, color: c.accent, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
          }}>全部已读</button>
        </div>
      )}
      {sorted.map((a) => {
        const handled = dismissed.has(a.event_id);
        const ts = typeof a.timestamp === 'string' ? a.timestamp :
          new Date((a.timestamp > 1e10 ? a.timestamp : a.timestamp * 1000)).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const conf = a.confidence ? `${(a.confidence * 100).toFixed(0)}%` : '--';
        const room = a.room || '未知房间';
        const riskColors: Record<string, string> = { high: c.danger, medium: c.warning, low: c.success };
        const riskColor = riskColors[a.risk_level] || c.muted;

        return (
          <div key={a.event_id} onClick={() => onViewAlert(a)} style={{
            background: c.card, borderRadius: 16, padding: '14px',
            marginBottom: 10, cursor: 'pointer', touchAction: 'manipulation',
            opacity: handled ? 0.55 : 1,
            boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {!handled && <span style={{ width: 8, height: 8, borderRadius: 4, background: c.danger, flexShrink: 0 }} />}
                  <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
                    {a.predicted_label === 'fall' ? '检测到跌倒' : '异常活动'}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    background: `${riskColor}18`, color: riskColor,
                  }}>{a.risk_level === 'high' ? '高风险' : a.risk_level === 'medium' ? '中风险' : '低风险'}</span>
                </div>
                <div style={{ fontSize: 12, color: c.muted }}>{ts} · {room}</div>
                <div style={{ fontSize: 12, color: c.secondary, marginTop: 4 }}>
                  置信度 {conf}{a.reason ? ` · ${a.reason}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ fontSize: 10, color: handled ? c.success : c.warning, fontWeight: 500 }}>
                  {handled ? '已处理' : '待处理'}
                </span>
                <span dangerouslySetInnerHTML={{ __html: Icons.chevronR }}
                  style={{ display: 'flex', opacity: 0.3 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROFILE VIEW  (avatar → full-screen slide-in)
   ═══════════════════════════════════════════════════════════════════ */
function ProfileView({ c, onBack, notify }: { c: Colors; onBack: () => void; notify: (msg: string) => void }) {
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const darkMode = useAppStore((s) => s.darkMode);

  return (
    <div>
      {/* ── Profile card ──────────────────────────────────────── */}
      <div style={{
        background: c.card, borderRadius: 20, padding: '16px',
        marginTop: 6, textAlign: 'center', marginBottom: 10,
          boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF', fontSize: 28, fontWeight: 700,
          }}>安</div>
          <h3 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: c.text }}>安妮特·迈尔斯</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: c.muted }}>ID: WF-2024-0815</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>78</div>
              <div style={{ fontSize: 11, color: c.muted }}>岁</div>
            </div>
            <div style={{ width: 1, background: c.hairline }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>A+</div>
              <div style={{ fontSize: 11, color: c.muted }}>血型</div>
            </div>
            <div style={{ width: 1, background: c.hairline }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>162</div>
              <div style={{ fontSize: 11, color: c.muted }}>cm</div>
            </div>
          </div>
        </div>

        {/* ── Health summary ────────────────────────────────────── */}
        <SectionLabel c={c} text="健康概览" />
        <div style={{
          background: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 6,
          boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <MenuItem c={c} label="健康数据" sub="步数、心率、活动趋势" icon={Icons.home(c.accent)} onClick={() => notify('健康数据 — 演示模式')} />
          <MenuItem c={c} label="紧急联系人" sub="管理与通知优先级" icon={Icons.phone} onClick={() => notify('紧急联系人 — 演示模式')} last />
        </div>

        {/* ── Device ────────────────────────────────────────────── */}
        <SectionLabel c={c} text="设备与系统" />
        <div style={{
          background: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 0,
          boxShadow: c.bg === '#0B0C0F' ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <MenuItem c={c} label="深色模式" sub={darkMode ? '已开启' : '已关闭'} icon={Icons.moon(c.accent)} onClick={() => {
            const nv = !darkMode;
            setDarkMode(nv);
            try { window.parent.document.documentElement.setAttribute('data-theme', nv ? 'dark' : 'light'); } catch {}
            document.documentElement.setAttribute('data-theme', nv ? 'dark' : 'light');
            notify(nv ? '已切换为深色模式' : '已切换为浅色模式');
          }} />
          <MenuItem c={c} label="传感器管理" sub={`${MOCK_SENSORS.filter((s) => s.online).length} 台在线`} icon={Icons.wifi(c.success)} onClick={() => notify('传感器管理 — 演示模式')} last={false} />
          <MenuItem c={c} label="关于吾家智护" sub="v1.2.0 · WiFi Fall Guard" icon={Icons.shield} onClick={() => notify('吾家智护 WiFi Fall Guard v1.2.0')} last />
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
          <button onClick={() => notify('已退出登录（演示模式）')} style={{
            padding: '12px 40px', borderRadius: 14, border: `1px solid ${c.danger}40`,
            background: 'transparent', color: c.danger, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
          }}>退出登录</button>
        </div>
    </div>
  );
}

function MenuItem({ c, label, sub, icon, onClick, last }: { c: Colors; label: string; sub: string; icon: string; onClick: () => void; last?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '14px 16px', border: 'none', borderBottom: last ? 'none' : `1px solid ${c.hairline}`,
      background: 'transparent', display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', textAlign: 'left',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: c.cardMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }} dangerouslySetInnerHTML={{ __html: icon }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{label}</div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{sub}</div>
      </div>
      <span dangerouslySetInnerHTML={{ __html: Icons.chevronR }} style={{ display: 'flex', opacity: 0.25 }} />
    </button>
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
          source: m.frame?.source || 'demo_trigger',
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

  // Sync alerts from database: merges API data with live WS alerts, dedup by event_id
  const syncAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      // Only keep demo-triggered alerts (legacy: no source or 'unknown'; new: 'demo_trigger')
      const demoData = data.filter((a) => !a.source || a.source === 'unknown' || a.source === 'demo_trigger');
      // Merge into local alerts by event_id, keep WS alerts that arrived before API response
      setAlerts((prev) => {
        const prevIds = new Set(prev.map((a) => a.event_id));
        const newFromApi = demoData.filter((a) => !prevIds.has(a.event_id));
        // Prepend API data (has DB-persisted fields like source/handled), dedup by event_id
        const merged = newFromApi.map((a) => {
          const exists = prev.find((p) => p.event_id === a.event_id);
          return exists ? { ...a, ...exists } : a;
        });
        return merged.length > 0 ? merged : prev;
      });
      // Mark already-handled alerts as dismissed
      const handledIds = demoData.filter((a) => a.handled).map((a) => a.event_id);
      if (handledIds.length > 0) {
        setDismissed((prev) => { const next = new Set(prev); handledIds.forEach((id) => next.add(id)); return next; });
      }
    } catch { /* API unavailable — keep WS-only alerts */ }
  }, []);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showTopCard, setShowTopCard] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [historyAlert, setHistoryAlert] = useState<AlertEvent | null>(null);
  const [loading, setLoading] = useState(false);

  const toTs = (a: AlertEvent) => {
    const t = a.timestamp;
    if (typeof t === 'number') return t > 1e10 ? t : t * 1000;
    const p = new Date(t).getTime();
    return Number.isNaN(p) ? 0 : p;
  };

  // Latest undismissed alert shown first
  const active = useMemo(() => {
    const undismissed = alerts.filter((a) => !dismissed.has(a.event_id));
    if (undismissed.length === 0) return null;
    undismissed.sort((a, b) => toTs(b) - toTs(a));
    return undismissed[0];
  }, [alerts, dismissed]);

  const unread = alerts.filter((a) => !dismissed.has(a.event_id)).length;

  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;

  const dismiss = useCallback(async (id: string) => {
    setLoading(true);

    const targetAlert = alerts.find((a) => a.event_id === id);
    const targetTs = targetAlert ? toTs(targetAlert) : null;

    // Collect all undismissed alerts ≤ target timestamp to batch-handle
    const batchIds: string[] = [];
    if (targetTs != null) {
      for (const a of alerts) {
        if (dismissedRef.current.has(a.event_id)) continue;
        if (toTs(a) <= targetTs) batchIds.push(a.event_id);
      }
    } else {
      batchIds.push(id);
    }

    // Fire API calls (best-effort)
    Promise.allSettled(batchIds.map((eid) => updateAlert(eid, { handled: true }))).catch(() => {});

    setDismissed((prev) => {
      const next = new Set(prev);
      batchIds.forEach((eid) => next.add(eid));
      return next;
    });
    setShowTopCard(false);
    setShowSheet(false);
    setLoading(false);
  }, [alerts]);

  const emergency = useCallback((a: AlertEvent) => {
    dismiss(a.event_id);
    window.location.href = 'tel:13800000000';
  }, [dismiss]);

  const callToast = useCallback(() => {
    notification.info({ message: '演示模式', description: '实际将拨打紧急联系人', placement: 'top' });
  }, [notification]);

  const expand = useCallback(() => { setShowTopCard(false); setShowSheet(true); }, []);

  useEffect(() => { setShowTopCard(true); setShowSheet(false); }, [active?.event_id]);

  const topConfirm = useCallback((id: string) => dismiss(id), [dismiss]);

  /* ── Navigation ──────────────────────────────────────────────── */
  const [view, setView] = useState<View>('main');
  const [tab, setTab] = useState<Tab>('home');

  // Sync alerts from DB on mount and when entering alert history
  useEffect(() => { syncAlerts(); }, [syncAlerts]);

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
        display: view === 'main' ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, zIndex: 20,
      }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: c.text, letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/fall.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          吾家智护
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => setView('alerts')} style={{
            position: 'relative', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
            touchAction: 'manipulation', borderRadius: 10,
          }}>
            <span dangerouslySetInnerHTML={{ __html: Icons.bell(c.text) }} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 0, right: 2,
                minWidth: 16, height: 16, borderRadius: 8,
                background: c.danger, color: '#FFF', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button onClick={() => setView('profile')} style={{
            width: 34, height: 34, borderRadius: 17, border: 'none', padding: 0, cursor: 'pointer',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF', fontSize: 14, fontWeight: 600,
            touchAction: 'manipulation',
          }}>A</button>
        </div>
      </div>

      {/* ── Main view ──────────────────────────────────────────── */}
      <div style={{ display: view === 'main' ? 'contents' : 'none' }}>
        {/* ── Banner ─────────────────────────────────────────── */}
        {useAppStore((s) => s.apiState) === 'offline' && (
          <div style={{
            margin: '0 14px 8px', padding: '8px 14px', borderRadius: 10,
            background: c.warningBg, color: c.warning,
            fontSize: 12, textAlign: 'center', fontWeight: 500,
          }}>后端服务未连接</div>
        )}

        {/* ── Top alert card ─────────────────────────────────── */}
        {tab !== 'home' && showTopCard && active && !loading && (
          <TopAlertBar alert={active} c={c} onConfirm={topConfirm} onExpand={expand} />
        )}

        {/* ── Content ────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '0 14px',
          paddingBottom: 84, scrollbarWidth: 'none',
        }}>
          {tab === 'home'     && <HomeTab c={c} alert={active} showTopCard={showTopCard} loading={loading} onConfirm={topConfirm} onExpand={expand} />}
          {tab === 'sensors'  && <SensorsTab c={c} />}
          {tab === 'trusted'  && <TrustedTab c={c} notify={(msg) => notification.info({ message: msg, placement: 'top', duration: 2 })} />}
          {tab === 'settings' && <SettingsTab c={c} dark={sysDark} notify={(msg) => notification.info({ message: msg, placement: 'top', duration: 2 })} />}
        </div>

        {/* ── Tab bar ────────────────────────────────────────── */}
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

        {/* ── Alert sheet ────────────────────────────────────── */}
        <AlertSheet
          alert={active}
          visible={showSheet && !!active && !loading}
          onDismiss={dismiss}
          onClose={() => { setShowSheet(false); setShowTopCard(true); }}
          onEmergency={emergency}
          onCall={callToast}
          c={c}
        />
      </div>

      {/* ── Alerts view ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: view === 'alerts' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${c.hairline}`,
          background: c.card,
        }}>
          <button onClick={() => setView('main')} style={{
            width: 34, height: 34, borderRadius: 10, border: 'none',
            background: c.cardMuted, color: c.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }} dangerouslySetInnerHTML={{ __html: Icons.back(c.text) }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: c.text }}>告警记录</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
          <AlertHistoryView
            c={c} alerts={alerts} dismissed={dismissed}
            onBack={() => setView('main')} onDismiss={dismiss}
            onViewAlert={(a) => { setHistoryAlert(a); }}
          />
        </div>
      </div>

      {/* ── Profile view ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: view === 'profile' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${c.hairline}`,
          background: c.card,
        }}>
          <button onClick={() => setView('main')} style={{
            width: 34, height: 34, borderRadius: 10, border: 'none',
            background: c.cardMuted, color: c.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }} dangerouslySetInnerHTML={{ __html: Icons.back(c.text) }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: c.text }}>个人中心</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
          <ProfileView
            c={c} onBack={() => setView('main')}
            notify={(msg) => notification.info({ message: msg, placement: 'top', duration: 2 })}
          />
        </div>
      </div>

      {/* ── History alert sheet ─────────────────────────────────── */}
      <AlertSheet
        alert={historyAlert}
        visible={!!historyAlert}
        readonly={!!historyAlert?.handled}
        onDismiss={(id) => { dismiss(id); setHistoryAlert(null); }}
        onClose={() => setHistoryAlert(null)}
        onEmergency={(a) => { dismiss(a.event_id); setHistoryAlert(null); }}
        onCall={callToast}
        c={c}
      />
    </div>
  );
}
