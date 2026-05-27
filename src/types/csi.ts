export type SimulatorLabel = 'empty' | 'walking' | 'sitting' | 'lying' | 'fall' | 'unknown';

export type Label = SimulatorLabel | 'normal';

export interface SimulatorSequenceItem {
  label: SimulatorLabel;
  duration_frames: number;
}

export interface AlertEvent {
  event_id: string;
  timestamp: number | string;
  room: string;
  device_id: string;
  predicted_label: string;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high' | string;
  handled: boolean;
  reason?: string;
  handler_note?: string;
  [key: string]: unknown;
}

export interface AlertSummaryCount {
  total: number;
  handled: number;
  unhandled: number;
}

export interface AlertUpdatePayload {
  handled: boolean;
  handler_note?: string;
}

export interface BackendStatus {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export interface CsiFrame {
  frame_id: number;
  timestamp: number;
  room: string;
  device_id: string;
  subcarriers: number[];
  simulated_label?: string;
}

export interface CsiResult {
  timestamp: number;
  room: string;
  device_id: string;
  predicted_label: string;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high' | string;
  alert: boolean;
  reason?: string;
  activity_score: number;
  features?: Record<string, unknown>;
}

export interface CsiSummary {
  total_frames: number;
  alert_count: number;
  latest_label: string;
  latest_risk_level: string;
  uptime_seconds: number;
}

export interface CsiWebSocketMessage {
  frame: CsiFrame;
  result: CsiResult;
  summary: CsiSummary;
}

export interface LatestResult {
  label?: Label | string;
  confidence?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface RecentResult extends LatestResult {
  id?: string | number;
}

export type CsiMessage = CsiWebSocketMessage;
