export type Label = 'normal' | 'fall';

export interface BackendStatus {
  status?: string;
  message?: string;
  [key: string]: unknown;
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

export interface CsiMessage {
  timestamp?: string;
  amplitudes?: number[];
  phases?: number[];
  prediction?: LatestResult;
  [key: string]: unknown;
}
