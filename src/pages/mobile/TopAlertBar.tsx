import { useCallback } from 'react';
import type { AlertEvent } from '../../types/csi';

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
  alert: AlertEvent;
  c: Colors;
  onConfirm: (id: string) => void;
  onExpand: (a: AlertEvent) => void;
}

const ROOM: Record<string, string> = {
  home: '客厅传感器', home_lab_left: '客厅传感器', home_lab_right: '客厅传感器',
  living_room: '客厅传感器', lecture_room: '卧室传感器', meeting_room: '前门传感器',
  room_1: '大厅传感器', real_room: '大厅传感器', demo: '客厅传感器',
};

function ft(ts: number | string) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date((ts > 1e10 ? ts : ts * 1000));
  if (isNaN(d.getTime())) return String(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ALERT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

export default function TopAlertBar({ alert, c, onConfirm, onExpand }: Props) {
  const confirm = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onConfirm(alert.event_id); }, [alert.event_id, onConfirm]);
  const room = ROOM[alert.room] || `${alert.room}传感器`;

  return (
    <div onClick={() => onExpand(alert)} style={{
      margin: '0 14px 8px', padding: '14px 16px',
      borderRadius: 16, background: c.dangerBg,
      border: `1px solid ${c.danger}18`,
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', touchAction: 'manipulation',
      animation: 'fade-up 0.3s ease-out',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: `${c.danger}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: c.danger,
      }} dangerouslySetInnerHTML={{ __html: ALERT_ICON }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>检测到可能跌倒</div>
        <div style={{ fontSize: 12, color: c.secondary, marginTop: 2 }}>{ft(alert.timestamp)} · {room}</div>
      </div>

      <button onClick={confirm} style={{
        flexShrink: 0, padding: '8px 16px', borderRadius: 20,
        border: 'none', background: c.successBg, color: c.success,
        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        touchAction: 'manipulation', minHeight: 36, whiteSpace: 'nowrap',
      }}>确认安全</button>
    </div>
  );
}
