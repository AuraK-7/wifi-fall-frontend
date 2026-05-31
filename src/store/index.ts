import { create } from 'zustand';
import type { AlertSummaryCount, BackendStatus, CsiMessage, ModelStatus } from '../types/csi';
import type { IncidentView } from '../types/incident';

// ── Types ────────────────────────────────────────────────────────────
export type ConnectionState = 'checking' | 'online' | 'offline';
export type TimeRange = '1h' | '24h' | '7d';

export interface ActivityPoint {
  time: string;
  value: number;
  timestamp: number;
}

export interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'alert_triggered' | 'source_switch' | 'detector_switch' | 'connection_change' | 'system';
  title: string;
  detail?: string;
  level: 'info' | 'warning' | 'error';
}

export interface BrushRange {
  startIndex: number;
  endIndex: number;
}

export interface AppStore {
  // ── Connection State ─────────────────────────────────────────────
  apiState: ConnectionState;
  wsState: ConnectionState;
  apiError: string;
  wsError: string;
  modelError: string;

  // ── Backend Data ─────────────────────────────────────────────────
  backendStatus: BackendStatus | null;
  modelStatus: ModelStatus | null;
  latestMessage: CsiMessage | null;
  activityHistory: ActivityPoint[];

  // ── Performance Metrics ──────────────────────────────────────────
  currentFps: number;
  wsLatency: number;
  messageTimestamps: number[];

  // ── Alert / Incident State ───────────────────────────────────────
  incidents: IncidentView[];
  alertSummary: AlertSummaryCount;
  selectedIncidentId: string;
  incidentsLoading: boolean;
  incidentsError: string;
  isOperatingId: string;

  // ── Settings State ───────────────────────────────────────────────
  currentSource: string;
  currentDetectorMode: string;

  // ── UI State ─────────────────────────────────────────────────────
  drawerOpen: boolean;
  timeRange: TimeRange;
  muted: boolean;
  fullscreen: boolean;
  darkMode: boolean;
  brushRange: BrushRange | null;
  selectedDevices: string[];
  showGuide: boolean;

  // ── Event Stream ─────────────────────────────────────────────────
  systemEvents: SystemEvent[];

  // ── Actions: Connection ──────────────────────────────────────────
  setApiState: (state: ConnectionState) => void;
  setWsState: (state: ConnectionState) => void;
  setApiError: (error: string) => void;
  setWsError: (error: string) => void;
  setModelError: (error: string) => void;

  // ── Actions: Data ────────────────────────────────────────────────
  setBackendStatus: (status: BackendStatus | null) => void;
  setModelStatus: (status: ModelStatus | null) => void;
  setLatestMessage: (msg: CsiMessage) => void;
  appendActivityPoint: (point: ActivityPoint) => void;
  recordMessageTimestamp: (ts: number) => void;

  // ── Actions: Incidents ───────────────────────────────────────────
  setIncidents: (incidents: IncidentView[]) => void;
  setAlertSummary: (summary: AlertSummaryCount) => void;
  setSelectedIncidentId: (id: string) => void;
  setIncidentsLoading: (loading: boolean) => void;
  setIncidentsError: (error: string) => void;
  setIsOperatingId: (id: string) => void;

  // ── Actions: Settings ────────────────────────────────────────────
  setCurrentSource: (source: string) => void;
  setCurrentDetectorMode: (mode: string) => void;

  // ── Actions: UI ──────────────────────────────────────────────────
  setDrawerOpen: (open: boolean) => void;
  setTimeRange: (range: TimeRange) => void;
  setMuted: (muted: boolean) => void;
  setFullscreen: (fs: boolean) => void;
  setDarkMode: (dark: boolean) => void;
  setBrushRange: (range: BrushRange | null) => void;
  setSelectedDevices: (devices: string[]) => void;
  dismissGuide: () => void;

  // ── Actions: Events ──────────────────────────────────────────────
  pushSystemEvent: (event: SystemEvent) => void;
}

// ── Constants ────────────────────────────────────────────────────────
const MAX_ACTIVITY_POINTS = 1800; // 30 min at 1 FPS (after throttling)
const MAX_SYSTEM_EVENTS = 50;
const FPS_WINDOW_MS = 3000;
const MAX_MESSAGE_TIMESTAMPS = 120;

function toMinutesAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function addSystemEvent(event: SystemEvent) {
  const state = useAppStore.getState();
  useAppStore.setState({
    systemEvents: [event, ...state.systemEvents].slice(0, MAX_SYSTEM_EVENTS),
  });
}

// ── Store ────────────────────────────────────────────────────────────
export const useAppStore = create<AppStore>((set, get) => ({
  // ── Connection ────────────────────────────────────────────────────
  apiState: 'checking',
  wsState: 'checking',
  apiError: '',
  wsError: '',
  modelError: '',

  // ── Backend Data ──────────────────────────────────────────────────
  backendStatus: null,
  modelStatus: null,
  latestMessage: null,
  activityHistory: [],

  // ── Performance ───────────────────────────────────────────────────
  currentFps: 0,
  wsLatency: 0,
  messageTimestamps: [],

  // ── Incidents ─────────────────────────────────────────────────────
  incidents: [],
  alertSummary: { total: 0, handled: 0, unhandled: 0 },
  selectedIncidentId: '',
  incidentsLoading: false,
  incidentsError: '',
  isOperatingId: '',

  // ── Settings ──────────────────────────────────────────────────────
  currentSource: '--',
  currentDetectorMode: '--',

  // ── UI ────────────────────────────────────────────────────────────
  drawerOpen: false,
  timeRange: '1h',
  muted: false,
  fullscreen: false,
  darkMode: false,
  brushRange: null,
  selectedDevices: [],
  showGuide: true,

  // ── Events ────────────────────────────────────────────────────────
  systemEvents: [],

  // ── Actions: Connection ───────────────────────────────────────────
  setApiState: (apiState) => {
    const prev = get().apiState;
    set({ apiState });
    if (prev !== apiState) {
      addSystemEvent({
        id: `conn-api-${Date.now()}`,
        timestamp: Date.now(),
        type: 'connection_change',
        title: `API ${apiState === 'online' ? '已连接' : '连接断开'}`,
        level: apiState === 'online' ? 'info' : 'error',
      });
    }
  },
  setWsState: (wsState) => {
    const prev = get().wsState;
    set({ wsState });
    if (prev !== wsState) {
      addSystemEvent({
        id: `conn-ws-${Date.now()}`,
        timestamp: Date.now(),
        type: 'connection_change',
        title: `WebSocket ${wsState === 'online' ? '已连接' : '连接断开'}`,
        level: wsState === 'online' ? 'info' : 'error',
      });
    }
  },
  setApiError: (apiError) => set({ apiError }),
  setWsError: (wsError) => set({ wsError }),
  setModelError: (modelError) => set({ modelError }),

  // ── Actions: Data ─────────────────────────────────────────────────
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setModelStatus: (modelStatus) => set({ modelStatus }),
  setLatestMessage: (latestMessage) => set({ latestMessage }),
  appendActivityPoint: (point) =>
    set((state) => ({
      activityHistory: [...state.activityHistory.slice(-(MAX_ACTIVITY_POINTS - 1)), point],
    })),
  recordMessageTimestamp: (ts) =>
    set((state) => {
      const now = performance.now();
      const timestamps = [...state.messageTimestamps, ts].slice(-MAX_MESSAGE_TIMESTAMPS);
      // FPS: count messages in last FPS_WINDOW_MS
      const cutoff = now - FPS_WINDOW_MS;
      const recentTimestamps = timestamps.filter((t) => t > cutoff);
      const fps = recentTimestamps.length / (FPS_WINDOW_MS / 1000);
      const latency = Math.round(now - ts);
      return {
        messageTimestamps: timestamps,
        currentFps: Math.round(fps * 10) / 10,
        wsLatency: latency > 0 && latency < 5000 ? latency : state.wsLatency,
      };
    }),

  // ── Actions: Incidents ────────────────────────────────────────────
  setIncidents: (incidents) => set({ incidents }),
  setAlertSummary: (alertSummary) => set({ alertSummary }),
  setSelectedIncidentId: (selectedIncidentId) => {
    set({ selectedIncidentId });
    if (selectedIncidentId) {
      set({ drawerOpen: true });
    }
  },
  setIncidentsLoading: (incidentsLoading) => set({ incidentsLoading }),
  setIncidentsError: (incidentsError) => set({ incidentsError }),
  setIsOperatingId: (isOperatingId) => set({ isOperatingId }),

  // ── Actions: Settings ─────────────────────────────────────────────
  setCurrentSource: (currentSource) => {
    const prev = get().currentSource;
    set({ currentSource });
    if (prev !== currentSource && prev !== '--') {
      addSystemEvent({
        id: `src-${Date.now()}`,
        timestamp: Date.now(),
        type: 'source_switch',
        title: `数据源切换: ${prev} → ${currentSource}`,
        level: 'info',
      });
    }
  },
  setCurrentDetectorMode: (currentDetectorMode) => {
    const prev = get().currentDetectorMode;
    set({ currentDetectorMode });
    if (prev !== currentDetectorMode && prev !== '--') {
      addSystemEvent({
        id: `det-${Date.now()}`,
        timestamp: Date.now(),
        type: 'detector_switch',
        title: `检测器切换: ${prev} → ${currentDetectorMode}`,
        level: 'info',
      });
    }
  },

  // ── Actions: UI ───────────────────────────────────────────────────
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setTimeRange: (timeRange) => set({ timeRange }),
  setMuted: (muted) => set({ muted }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setDarkMode: (darkMode) => set({ darkMode }),
  setBrushRange: (brushRange) => set({ brushRange }),
  setSelectedDevices: (selectedDevices) => set({ selectedDevices }),
  dismissGuide: () => set({ showGuide: false }),

  // ── Actions: Events ───────────────────────────────────────────────
  pushSystemEvent: (event) =>
    set((state) => ({
      systemEvents: [event, ...state.systemEvents].slice(0, MAX_SYSTEM_EVENTS),
    })),
}));

// ── Selectors ────────────────────────────────────────────────────────
export const selectConnectionOk = (state: AppStore) =>
  state.apiState === 'online' && state.wsState === 'online';
export const selectAlertsCount = (state: AppStore) => state.alertSummary.unhandled;
