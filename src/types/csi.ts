export interface SequenceFrame {
  t: number;
  amplitude: number[];
  energy?: number;
  variance?: number;
}

export interface SequenceMetadata {
  activity_type: string;
  true_label: string;
  true_label_id: number;
  sample_index: number;
  total_samples_of_type: number;
  total_frames_raw: number;
  total_frames_downsampled: number;
  downsample_step: number;
  subcarrier_count: number;
  amplitude_min: number;
  amplitude_max: number;
  amplitude_mean: number;
  amplitude_std: number;
}

export interface SequenceResponse {
  metadata: SequenceMetadata;
  frames: SequenceFrame[];
}

export interface AvailableLabel {
  id: number;
  name: string;
  sample_count: number;
}

export interface AvailableLabelsResponse {
  labels: AvailableLabel[];
}
export type ActivityLabel = 'empty' | 'walking' | 'sitting' | 'lying' | 'fall' | 'non_fall' | 'unknown';
export type DetectorMode = 'simple' | 'enetfall' | 'cnn2d';

export interface CsvDataSourceCommand {
  csv_path: string;
  room?: string;
  device_id?: string;
  label?: ActivityLabel;
}

export interface EnetFallDataSourceCommand {
  data_dir?: string | null;
  dataset_names?: string[] | null;
  device_id?: string;
  room?: string;
}

export interface DetectorModeCommand {
  mode: DetectorMode;
}

export interface DataSourceStatus {
  source_mode: 'csv' | 'enetfall' | string;
  current_source: Record<string, unknown>;
  load_error: string | null;
}

export interface ModelStatus {
  detector_mode: DetectorMode | string;
  model_loaded: boolean;
  model_name: string;
  model_path: string;
  device: string;
  num_classes: number;
  class_names: string[];
  input_shape: number[];
  load_error: string | null;
  active_detector_mode?: DetectorMode | string;
}

export interface ModelSearchPath {
  env_key: string;
  path: string;
  exists: boolean;
  is_dir: boolean;
}

export interface DiscoveredModel {
  model_id: string;
  file_name: string;
  path: string;
  source_env_key?: string | null;
  detector_type: DetectorMode | string;
  extension: string;
  size_bytes: number;
  modified_at: string;
  active: boolean;
}

export interface ModelListResponse {
  active_detector_mode: DetectorMode | string;
  active_model_path: string;
  extensions: string[];
  search_paths: ModelSearchPath[];
  models: DiscoveredModel[];
}

export interface ModelActivatePayload {
  model_id?: string;
  path?: string;
  detector_type?: DetectorMode | string;
}

export interface ModelActivateResponse {
  activated: boolean;
  model?: DiscoveredModel;
  model_status?: ModelStatus;
  message?: string;
}

export interface BackendStatus {
  app?: string;
  env?: string;
  source?: DataSourceStatus;
  runtime?: CsiSummary;
  [key: string]: unknown;
}

export interface AlertEvent {
  event_id: string;
  timestamp: number | string;
  room: string;
  device_id: string;
  source?: string;
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

export interface CsiFrame {
  frame_id: number;
  timestamp: number;
  room: string;
  device_id: string;
  subcarriers: number[];
  simulated_label?: string;
  source?: string;
  window_shape?: number[] | null;
  label?: ActivityLabel | string | null;
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

export interface AvatarState {
  display_state: string;
  dataset_state?: string;
  predicted_state?: string;
  source?: string;
  dataset_label?: string | null;
  predicted_label?: string | null;
  confidence?: number | null;
  risk_level?: 'low' | 'medium' | 'high' | string;
  alert?: boolean;
}

export interface CsiSummary {
  total_frames: number;
  alert_count: number;
  latest_label: string;
  latest_risk_level: string;
  uptime_seconds: number;
}

export interface AnalyticsSnapshot {
  micro_doppler_spectrum: number[];   // 128 frequency bins (dB)
  subcarrier_amplitudes: number[];    // 30 per-subcarrier amplitudes
  antenna_correlation: number;        // 0..1
  energy: number;
  dominant_freq: number;              // Hz
  frequency_spread: number;           // Hz
  signal_variance: number;
}

export interface AnalyticsEntry extends AnalyticsSnapshot {
  frame_id: number;
  timestamp: number;
}

export interface CsiWebSocketMessage {
  frame: CsiFrame;
  result: CsiResult;
  summary: CsiSummary;
  avatar?: AvatarState | null;
  alert_saved?: boolean;
  analytics?: AnalyticsSnapshot | null;
  event_id?: string | null;
  evidence_chain?: EvidenceWindow[] | null;
}

export interface EvidenceWindow {
  window_index: number;
  room: string;
  analytics: AnalyticsSnapshot | null;
  label: string;
}

export interface EventWindowsResponse {
  event_id: string;
  alert_timestamp: number;
  centre_frame_id: number;
  window_count: number;
  windows: AnalyticsEntry[];
}

export interface ReplayWindow {
  window_index: number;
  room: string;
  analytics: AnalyticsSnapshot | null;
  label: string;
  avatar?: AvatarState | null;
}

export interface EventReplayResponse {
  event_id: string;
  start_window_index: number;
  end_window_index: number;
  centre_window_index: number;
  window_count: number;
  windows: ReplayWindow[];
}

export interface LatestResult {
  frame: CsiFrame;
  result: CsiResult;
  avatar?: AvatarState | null;
}

export interface RecentResult extends LatestResult {
  id?: string | number;
}

export type CsiMessage = CsiWebSocketMessage;

export type RootResponse = {
  app: string;
  env: string;
  status: string;
};

// ── Training ────────────────────────────────────────────────────────
export interface TrainingParams {
  epochs: number;
  batch_size: number;
  lr: number;
  p_mix: number;
  p_shadow: number;
  p_stretch: number;
  p_noise: number;
  weight_decay: number;
}

export type TrainingJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export interface TrainingJob {
  job_id: string;
  status: TrainingJobStatus;
  params: TrainingParams;
  started_at: string;
  finished_at: string | null;
  output_path?: string;
  log_path?: string;
  best_val_f1?: number | null;
  error?: string | null;
}

export interface TrainingLogResponse {
  job_id: string;
  log: string;
  lines: number;
  total_lines?: number;
}

// ── Model Metrics ──────────────────────────────────────────────────
export interface PerRoomMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  total: number;
  fall_pred_pct: number;
}

export interface ModelMetricsResponse {
  model?: string;
  params?: number;
  best_epoch?: number;
  best_val_f1?: number;
  config?: Record<string, unknown>;
  test?: PerRoomMetrics;
  per_room_test?: Record<string, PerRoomMetrics>;
  error?: string;
  path_checked?: string;
}
