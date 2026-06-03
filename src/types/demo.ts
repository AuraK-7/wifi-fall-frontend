import type { AnalyticsSnapshot, AvatarState } from './csi';

export type DemoPacketSource = 'console';
export type DemoPacketMode = 'single' | 'stream';
export type MobileModelRuntime = 'onnx-web' | 'tflite' | 'mock';
export type MobilePredictionLabel = 'fall' | 'non_fall';

export interface DemoCsiWindowFrame {
  frame_index: number;
  timestamp: number;
  subcarriers: number[];
  energy: number;
  variance: number;
}

export interface DemoCsiPacket {
  packet_id: string;
  sequence_id: string;
  frame_id: number;
  timestamp: number;
  room: string;
  device_id: string;
  source: DemoPacketSource;
  mode: DemoPacketMode;
  subcarrier_count: number;
  window_size: number;
  subcarriers: number[];
  window: DemoCsiWindowFrame[];
}

export interface DemoPacketAck {
  accepted: boolean;
  packet_id: string;
  sequence_id?: string;
  queued_at?: number;
  message?: string;
}

export interface MobileModelConfig {
  runtime: MobileModelRuntime;
  weight_url: string;
  input_shape: number[];
  class_names: MobilePredictionLabel[];
  threshold: number;
}

export interface MobileInferenceResult {
  predicted_label: MobilePredictionLabel;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  alert: boolean;
  activity_score: number;
  energy: number;
  variance: number;
  reason: string;
  avatar: AvatarState;
}

export interface MobileFallEventPayload {
  event_id: string;
  packet_id: string;
  sequence_id: string;
  timestamp: number;
  room: string;
  device_id: string;
  model: MobileModelConfig;
  packet: DemoCsiPacket;
  result: MobileInferenceResult;
  analytics: AnalyticsSnapshot;
}

export interface MobileFallEventResponse {
  event_id: string;
  saved: boolean;
  replay_url?: string;
  message?: string;
}
