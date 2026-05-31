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

function buildLocalSequence(activityType: string, sampleIndex: number, downsampleStep: number): SequenceResponse {
  const frameCount = 30;
  const subcarrierCount = 90;
  const activitySeed = activityType.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
    const amplitude = Array.from({ length: subcarrierCount }, (_, subcarrierIndex) => {
      const waveA = Math.sin((frameIndex + 1) * 0.14 + subcarrierIndex * 0.05 + sampleIndex * 0.03);
      const waveB = Math.cos((activitySeed + subcarrierIndex) * 0.02 + frameIndex * 0.09);
      const trend = activityType === 'fall' ? frameIndex * 0.08 : activityType === 'run' ? frameIndex * 0.03 : frameIndex * 0.015;
      return Number((1.2 + waveA * 0.5 + waveB * 0.3 + trend).toFixed(4));
    });

    const energy = amplitude.reduce((sum, value) => sum + value * value, 0);
    const mean = amplitude.reduce((sum, value) => sum + value, 0) / amplitude.length;
    const variance = amplitude.reduce((sum, value) => sum + (value - mean) ** 2, 0) / amplitude.length;

    return {
      t: frameIndex,
      amplitude,
      energy: Number(energy.toFixed(4)),
      variance: Number(variance.toFixed(4)),
    };
  });

  const flat = frames.flatMap((frame) => frame.amplitude);
  const trueLabel = activityType === 'normal' ? 'walk' : activityType;

  return {
    metadata: {
      activity_type: activityType,
      true_label: trueLabel,
      true_label_id: LOCAL_SEQUENCE_LABELS.findIndex((item) => item.name === trueLabel),
      sample_index: sampleIndex,
      total_samples_of_type: 8,
      total_frames_raw: frameCount,
      total_frames_downsampled: Math.ceil(frameCount / downsampleStep),
      downsample_step: downsampleStep,
      subcarrier_count: subcarrierCount,
      amplitude_min: Number(Math.min(...flat).toFixed(4)),
      amplitude_max: Number(Math.max(...flat).toFixed(4)),
      amplitude_mean: Number((flat.reduce((sum, value) => sum + value, 0) / flat.length).toFixed(4)),
      amplitude_std: Number(
        Math.sqrt(
          flat.reduce((sum, value) => {
            const mean = flat.reduce((innerSum, innerValue) => innerSum + innerValue, 0) / flat.length;
            return sum + (value - mean) ** 2;
          }, 0) / flat.length,
        ).toFixed(4),
      ),
    },
    frames: frames.filter((_, index) => index % downsampleStep === 0 || index === frameCount - 1),
  };
}

export async function getAvailableLabels(): Promise<AvailableLabelsResponse> {
  return { labels: LOCAL_SEQUENCE_LABELS };
}

export async function getSequence(activityType: string, sampleIndex = 0, downsampleStep = 4): Promise<SequenceResponse> {
  return buildLocalSequence(activityType, sampleIndex, downsampleStep);
}
