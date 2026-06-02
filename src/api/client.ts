import axios from 'axios';
import type {
  AvailableLabel,
  AvailableLabelsResponse,
  AlertEvent,
  AlertSummaryCount,
  AlertUpdatePayload,
  BackendStatus,
  CsvDataSourceCommand,
  DetectorModeCommand,
  EnetFallDataSourceCommand,
  ModelStatus,
  RootResponse,
  LatestResult,
  RecentResult,
  SequenceResponse,
  ModelMetricsResponse,
  TrainingParams,
  TrainingJob,
  TrainingLogResponse,
} from '../types/csi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:8000/ws/csi';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

export async function getBackendRoot() {
  const response = await apiClient.get<RootResponse>('/');
  return response.data;
}

export async function getBackendStatus() {
  const response = await apiClient.get<BackendStatus>('/api/status');
  return response.data;
}

export async function getDataSourceStatus() {
  const response = await apiClient.get<BackendStatus['source']>('/api/data-source/status');
  return response.data;
}

export async function getModelStatus() {
  const response = await apiClient.get<ModelStatus>('/api/model/status');
  return response.data;
}

export async function getAlerts() {
  const response = await apiClient.get<AlertEvent[] | { alerts: AlertEvent[] }>('/api/alerts');
  return Array.isArray(response.data) ? response.data : response.data.alerts;
}

export async function getAlertSummaryCount() {
  const response = await apiClient.get<AlertSummaryCount>('/api/alerts/summary/count');
  return response.data;
}

export async function getAlertById(eventId: string) {
  const response = await apiClient.get<AlertEvent>(`/api/alerts/${encodeURIComponent(eventId)}`);
  return response.data;
}

export async function updateAlert(eventId: string, payload: AlertUpdatePayload) {
  const response = await apiClient.patch<AlertEvent>(`/api/alerts/${encodeURIComponent(eventId)}`, payload);
  return response.data;
}

export async function switchToCsvSource(payload: CsvDataSourceCommand) {
  const response = await apiClient.post('/api/data-source/csv', payload);
  return response.data;
}

export async function switchToEnetFallSource(payload: EnetFallDataSourceCommand) {
  const response = await apiClient.post('/api/data-source/enetfall', payload);
  return response.data;
}

export async function updateDetectorMode(payload: DetectorModeCommand) {
  const response = await apiClient.post('/api/detector/mode', payload);
  return response.data;
}

export async function resetDetector() {
  const response = await apiClient.post('/api/detector/reset');
  return response.data;
}

export async function getLatestResult() {
  const response = await apiClient.get<LatestResult>('/api/results/latest');
  return response.data;
}

export async function getRecentResults() {
  const response = await apiClient.get<RecentResult[]>('/api/results/recent');
  return response.data;
}

const LOCAL_SEQUENCE_LABELS: AvailableLabel[] = [
  { id: 0, name: 'lie_down', sample_count: 8 },
  { id: 1, name: 'fall', sample_count: 8 },
  { id: 2, name: 'pick_up', sample_count: 8 },
  { id: 3, name: 'run', sample_count: 8 },
  { id: 4, name: 'sit_down', sample_count: 8 },
  { id: 5, name: 'stand_up', sample_count: 8 },
  { id: 6, name: 'walk', sample_count: 8 },
];

export async function getAvailableLabels(): Promise<AvailableLabelsResponse> {
  // 固定返回两种类型
  return { labels: [
    { id: 0, name: 'walk', sample_count: 50 },
    { id: 1, name: 'fall', sample_count: 50 }
  ]};
}

export async function getEventReplay(eventId: string, before = 80, after = 80) {
  const response = await apiClient.get<import('../types/csi').EventReplayResponse>(
    `/api/events/${encodeURIComponent(eventId)}/replay`,
    { params: { before, after } },
  );
  return response.data;
}

export async function getModelMetrics() {
  const response = await apiClient.get<ModelMetricsResponse>('/api/model/metrics');
  return response.data;
}

export async function getSequence(activityType: string, sampleIndex = 0, downsampleStep = 1): Promise<SequenceResponse> {
  const response = await apiClient.get<SequenceResponse>('/api/sequences', {
    params: { activity_type: activityType, sample_index: sampleIndex, downsample_step: downsampleStep }
  });
  return response.data;
}

// ── Training API ─────────────────────────────────────────────────────
export async function startTraining(params: TrainingParams) {
  const response = await apiClient.post<{ job_id: string; status: string }>(
    '/api/train/start', params,
    { timeout: 15000 },
  );
  return response.data;
}

export async function getTrainingStatus(jobId: string) {
  const response = await apiClient.get<TrainingJob>(`/api/train/status/${encodeURIComponent(jobId)}`);
  return response.data;
}

export async function listTrainingJobs() {
  const response = await apiClient.get<TrainingJob[]>('/api/train/list');
  return response.data;
}

export async function getTrainingLog(jobId: string, lines = 200) {
  const response = await apiClient.get<TrainingLogResponse>(
    `/api/train/log/${encodeURIComponent(jobId)}`,
    { params: { lines } },
  );
  return response.data;
}

export async function stopTraining(jobId: string) {
  const response = await apiClient.post<{ job_id: string; status: string }>(
    `/api/train/stop/${encodeURIComponent(jobId)}`,
  );
  return response.data;
}

export async function applyTraining(jobId: string) {
  const response = await apiClient.post<{ job_id: string; applied: boolean; model_loaded: boolean; best_val_f1?: number | null }>(
    `/api/train/apply/${encodeURIComponent(jobId)}`,
  );
  return response.data;
}
