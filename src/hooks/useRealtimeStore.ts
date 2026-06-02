import { useCallback, useEffect, useRef } from 'react';
import { getBackendStatus, getModelStatus, WS_URL } from '../api/client';
import { useAppStore } from '../store';
import type { CsiMessage } from '../types/csi';

const STATUS_POLL_INTERVAL_MS = 12_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 8_000;
const CHART_UPDATE_THROTTLE_MS = 100; // max 10 FPS for chart rendering
const MAX_ACTIVITY_POINTS = 1800; // 30 min at 10 FPS throttled max
const MEMORY_CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60s

let lastChartUpdate = 0;

function formatTimestamp(timestamp?: number) {
  if (typeof timestamp !== 'number') return '--';
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toLocaleTimeString();
}

function handleCsiMessage(msg: CsiMessage) {
  const store = useAppStore.getState();

  // Record raw performance timestamp for FPS calc (always)
  store.recordMessageTimestamp(performance.now());

  // Throttle chart updates to max 10 FPS to prevent ECharts stutter
  const now = performance.now();
  const shouldUpdateChart = now - lastChartUpdate >= CHART_UPDATE_THROTTLE_MS;

  if (shouldUpdateChart) {
    lastChartUpdate = now;
    store.setLatestMessage(msg);

    const score = msg.result?.activity_score;
    if (typeof score === 'number') {
      const point = {
        time: formatTimestamp(msg.result.timestamp),
        value: score,
        timestamp: Date.now(),
      };
      store.appendActivityPoint(point);
    }
  }

  const analytics = msg.analytics;
  if (analytics && msg.frame) {
    store.appendAnalyticsEntry({
      frame_id: msg.frame.frame_id,
      timestamp: msg.frame.timestamp,
      ...analytics,
    });
  }

  // Update source from message
  const source = msg.frame?.source;
  if (source) {
    store.setCurrentSource(source);
  }

  // Push alert-triggered events to system event stream
  if (msg.result?.alert) {
    store.pushSystemEvent({
      id: `alert-${Date.now()}`,
      timestamp: Date.now(),
      type: 'alert_triggered',
      title: `跌倒告警触发 — ${msg.result.room ?? '--'}`,
      detail: msg.result.reason,
      level: 'error',
    });
  }
}

// Periodic memory cleanup: trim activity history > 30 min
function startMemoryCleanup() {
  return setInterval(() => {
    const store = useAppStore.getState();
    const cutoff = Date.now() - 30 * 60 * 1000;
    const trimmed = store.activityHistory.filter((p) => p.timestamp > cutoff);
    if (trimmed.length < store.activityHistory.length) {
      useAppStore.setState({ activityHistory: trimmed });
    }
  }, MEMORY_CLEANUP_INTERVAL_MS);
}

export function useRealtimeStore() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    clearReconnectTimer();
    manualCloseRef.current = false;
    useAppStore.getState().setWsState('checking');
    useAppStore.getState().setWsError('');

    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      useAppStore.getState().setWsState('online');
      useAppStore.getState().setWsError('');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CsiMessage;
        handleCsiMessage(data);
      } catch {
        useAppStore.getState().setWsError('WebSocket 数据解析失败');
      }
    };

    socket.onerror = () => {
      useAppStore.getState().setWsState('offline');
      useAppStore.getState().setWsError('WebSocket 连接异常，请确认后端服务已启动');
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (manualCloseRef.current) return;

      useAppStore.getState().setWsState('offline');
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current,
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        connectWebSocket();
      }, delay);
    };
  }, [clearReconnectTimer]);

  const loadStatus = useCallback(async () => {
    useAppStore.getState().setApiState('checking');
    useAppStore.getState().setApiError('');
    useAppStore.getState().setModelError('');

    const [backendResult, modelResult] = await Promise.allSettled([getBackendStatus(), getModelStatus()]);

    if (backendResult.status === 'fulfilled') {
      useAppStore.getState().setBackendStatus(backendResult.value);
      useAppStore.getState().setApiState('online');
      useAppStore.getState().setApiError('');
      const sourceMode = backendResult.value?.source?.source_mode;
      if (sourceMode) {
        useAppStore.getState().setCurrentSource(sourceMode);
      }
    } else {
      useAppStore.getState().setBackendStatus(null);
      useAppStore.getState().setApiError(
        backendResult.reason instanceof Error ? backendResult.reason.message : '后端 API 连接失败',
      );
      useAppStore.getState().setApiState('offline');
    }

    if (modelResult.status === 'fulfilled') {
      useAppStore.getState().setModelStatus(modelResult.value);
      const mode =
        modelResult.value.active_detector_mode ?? modelResult.value.detector_mode;
      if (mode) {
        useAppStore.getState().setCurrentDetectorMode(mode);
      }
    } else {
      useAppStore.getState().setModelStatus(null);
      useAppStore.getState().setModelError(
        modelResult.reason instanceof Error ? modelResult.reason.message : '模型状态获取失败',
      );
    }
  }, []);

  const reconnectWs = useCallback(() => {
    manualCloseRef.current = true;
    clearReconnectTimer();
    socketRef.current?.close();
    connectWebSocket();
  }, [clearReconnectTimer, connectWebSocket]);

  useEffect(() => {
    loadStatus();
    connectWebSocket();

    const timer = window.setInterval(() => {
      loadStatus();
    }, STATUS_POLL_INTERVAL_MS);

    const cleanupTimer = startMemoryCleanup();

    return () => {
      manualCloseRef.current = true;
      clearReconnectTimer();
      window.clearInterval(timer);
      window.clearInterval(cleanupTimer);
      socketRef.current?.close();
    };
  }, [clearReconnectTimer, connectWebSocket, loadStatus]);

  return { loadStatus, reconnectWs };
}
