import axios from 'axios';
import type { BackendStatus, Label, LatestResult, RecentResult } from '../types/csi';

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

export async function sendSimulatorLabel(label: Label) {
  const response = await apiClient.post(`/api/simulator/label/${label}`);
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
