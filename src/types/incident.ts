import type { AlertEvent } from './csi';

export type IncidentStatus = 'triggered' | 'acknowledged' | 'resolved';

export interface IncidentTimelineItem {
  id: string;
  timestamp: number;
  actor: string;
  action: 'triggered' | 'acknowledged' | 'escalated' | 'resolved' | 'note';
  note?: string;
}

export interface IncidentView {
  id: string;
  fingerprint: string;
  title: string;
  status: IncidentStatus;
  severity: 'high' | 'medium' | 'low' | string;
  room: string;
  deviceId: string;
  predictedLabel: string;
  confidence: number;
  eventCount: number;
  firstSeen: number;
  lastSeen: number;
  reason?: string;
  alerts: AlertEvent[];
  timeline: IncidentTimelineItem[];
}
