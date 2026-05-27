import axios from 'axios';
import type {
  AlertEvent,
  AlertSummaryCount,
  AlertUpdatePayload,
  BackendStatus,
  Label,
  LatestResult,
  RecentResult,
  SimulatorSequenceItem,
} from '../types/csi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:8000/ws/csi';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

export async function getBackendRoot() {
  const response = await apiClient.get('/');
  return response.data;
}

export async function getBackendStatus() {
  const response = await apiClient.get<BackendStatus>('/api/status');
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

export async function sendSimulatorLabel(label: Label) {
  const response = await apiClient.post(`/api/simulator/label/${label}`);
  return response.data;
}

export async function setSimulatorRoom(room: string) {
  const response = await apiClient.post(`/api/simulator/room/${encodeURIComponent(room)}`);
  return response.data;
}

export async function setSimulatorDevice(deviceId: string) {
  const response = await apiClient.post(`/api/simulator/device/${encodeURIComponent(deviceId)}`);
  return response.data;
}

export async function setSimulatorSequence(sequence: SimulatorSequenceItem[]) {
  const response = await apiClient.post('/api/simulator/sequence', sequence);
  return response.data;
}

export async function getSimulatorSequence() {
  const response = await apiClient.get<SimulatorSequenceItem[]>('/api/simulator/sequence');
  return response.data;
}

export async function clearSimulatorSequence() {
  const response = await apiClient.delete('/api/simulator/sequence');
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
