import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getAlerts, getAlertSummaryCount, updateAlert } from '../api/client';
import { useAppStore } from '../store';
import type { AlertEvent, AlertSummaryCount } from '../types/csi';
import type { IncidentTimelineItem, IncidentView } from '../types/incident';

const POLL_INTERVAL_MS = 10_000;
const GROUP_WINDOW_MS = 10 * 60 * 1000;

interface LocalOpsState {
  acknowledged: Record<string, boolean>;
  timeline: Record<string, IncidentTimelineItem[]>;
}

function toEpoch(value: AlertEvent['timestamp']) {
  if (typeof value === 'number') {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeSeverity(value?: string) {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

function fingerprint(alert: AlertEvent) {
  return [
    alert.room || 'unknown-room',
    alert.device_id || 'unknown-device',
    alert.predicted_label || 'unknown-label',
    normalizeSeverity(alert.risk_level),
  ].join('|');
}

function nextTimelineFromAlerts(alerts: AlertEvent[]): IncidentTimelineItem[] {
  return alerts
    .slice(0, 5)
    .map((alert) => ({
      id: `trigger-${alert.event_id}`,
      timestamp: toEpoch(alert.timestamp),
      actor: 'detector',
      action: 'triggered' as const,
      note: alert.reason || '模型触发事件',
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function mergeTimelines(base: IncidentTimelineItem[], extra: IncidentTimelineItem[]) {
  const merged = [...base, ...extra];
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged.slice(0, 16);
}

function buildIncidents(alerts: AlertEvent[], localState: LocalOpsState): IncidentView[] {
  // 1:1 mapping — each alert is its own incident, no grouping
  const sorted = [...alerts].sort((a, b) => toEpoch(b.timestamp) - toEpoch(a.timestamp));
  return sorted.map(alert => {
    const ts = toEpoch(alert.timestamp);
    const id = alert.event_id;
    const timeline = mergeTimelines(nextTimelineFromAlerts([alert]), localState.timeline[id] ?? []);
    return {
      id,
      fingerprint: fingerprint(alert),
      title: `${alert.predicted_label || 'unknown'} @ ${alert.room || '--'}`,
      status: (alert.handled ? 'resolved' : localState.acknowledged[id] ? 'acknowledged' : 'triggered') as IncidentView['status'],
      severity: normalizeSeverity(alert.risk_level),
      room: alert.room || '--',
      deviceId: alert.device_id || '--',
      predictedLabel: alert.predicted_label || '--',
      confidence: alert.confidence,
      eventCount: 1,
      firstSeen: ts,
      lastSeen: ts,
      reason: alert.reason,
      alerts: [alert],
      timeline,
    };
  });
}

export function useIncidentStore() {
  const localStateRef = useRef<LocalOpsState>({ acknowledged: {}, timeline: {} });

  const refreshIncidents = useCallback(async () => {
    useAppStore.getState().setIncidentsLoading(true);
    useAppStore.getState().setIncidentsError('');

    try {
      const [alerts, summary] = await Promise.all([getAlerts(), getAlertSummaryCount()]);
      const incidents = buildIncidents(alerts, localStateRef.current);
      useAppStore.getState().setIncidents(incidents);
      useAppStore.getState().setAlertSummary(summary);
    } catch (error) {
      useAppStore.getState().setIncidentsError(
        error instanceof Error ? error.message : '告警中心刷新失败',
      );
    } finally {
      useAppStore.getState().setIncidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshIncidents();
    const timer = window.setInterval(() => {
      refreshIncidents();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshIncidents]);

  const appendTimeline = useCallback((incidentId: string, action: IncidentTimelineItem['action'], note?: string) => {
    const prev = localStateRef.current;
    const existing = prev.timeline[incidentId] ?? [];
    const entry: IncidentTimelineItem = {
      id: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      actor: 'operator',
      action,
      note,
    };
    localStateRef.current = {
      ...prev,
      timeline: {
        ...prev.timeline,
        [incidentId]: [entry, ...existing].slice(0, 16),
      },
    };
    // Rebuild with updated local state
    const store = useAppStore.getState();
    // Trigger re-render by rebuilding incidents from stored raw data
    // We need to re-fetch for simplicity
    refreshIncidents();
  }, [refreshIncidents]);

  const acknowledgeIncident = useCallback(
    (incidentId: string, note?: string) => {
      const prev = localStateRef.current;
      localStateRef.current = {
        ...prev,
        acknowledged: { ...prev.acknowledged, [incidentId]: true },
      };
      appendTimeline(incidentId, 'acknowledged', note || '值班员已确认接手');
    },
    [appendTimeline],
  );

  const escalateIncident = useCallback(
    (incidentId: string, note?: string) => {
      appendTimeline(incidentId, 'escalated', note || '升级到二线/负责人处理');
    },
    [appendTimeline],
  );

  const addIncidentNote = useCallback(
    (incidentId: string, note: string) => {
      if (!note.trim()) return;
      appendTimeline(incidentId, 'note', note.trim());
    },
    [appendTimeline],
  );

  const resolveIncident = useCallback(
    async (incident: IncidentView) => {
      const unresolvedAlerts = incident.alerts.filter((alert) => !alert.handled);
      if (!unresolvedAlerts.length) return;

      useAppStore.getState().setIsOperatingId(incident.id);

      try {
        await Promise.all(
          unresolvedAlerts.map((alert) =>
            updateAlert(alert.event_id, { handled: true, handler_note: '控制台闭环处置' }),
          ),
        );
        appendTimeline(incident.id, 'resolved', '事件已闭环');
        await refreshIncidents();
      } catch (error) {
        useAppStore.getState().setIncidentsError(
          error instanceof Error ? error.message : '事件闭环失败',
        );
      } finally {
        useAppStore.getState().setIsOperatingId('');
      }
    },
    [appendTimeline, refreshIncidents],
  );

  return {
    refreshIncidents,
    acknowledgeIncident,
    escalateIncident,
    addIncidentNote,
    resolveIncident,
  };
}

/**
 * Hook for components that need incident operations without running the poll loop.
 * Use this in components (like Drawer) that are rendered inside a page where
 * useIncidentStore already runs.
 */
export function useIncidentOps() {
  const localStateRef = useRef<LocalOpsState>({ acknowledged: {}, timeline: {} });

  const refreshIncidents = useCallback(async () => {
    useAppStore.getState().setIncidentsLoading(true);
    try {
      const [alerts, summary] = await Promise.all([getAlerts(), getAlertSummaryCount()]);
      const incidents = buildIncidents(alerts, localStateRef.current);
      useAppStore.getState().setIncidents(incidents);
      useAppStore.getState().setAlertSummary(summary);
    } catch {
      // silent in drawer context
    } finally {
      useAppStore.getState().setIncidentsLoading(false);
    }
  }, []);

  const appendTimeline = useCallback((incidentId: string, action: IncidentTimelineItem['action'], note?: string) => {
    const prev = localStateRef.current;
    const existing = prev.timeline[incidentId] ?? [];
    const entry: IncidentTimelineItem = {
      id: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      actor: 'operator',
      action,
      note,
    };
    localStateRef.current = {
      ...prev,
      timeline: { ...prev.timeline, [incidentId]: [entry, ...existing].slice(0, 16) },
    };
    refreshIncidents();
  }, [refreshIncidents]);

  return {
    acknowledgeIncident: useCallback(
      (incidentId: string, note?: string) => {
        const prev = localStateRef.current;
        localStateRef.current = {
          ...prev,
          acknowledged: { ...prev.acknowledged, [incidentId]: true },
        };
        appendTimeline(incidentId, 'acknowledged', note || '值班员已确认接手');
      },
      [appendTimeline],
    ),
    escalateIncident: useCallback(
      (incidentId: string, note?: string) => {
        appendTimeline(incidentId, 'escalated', note || '升级处理');
      },
      [appendTimeline],
    ),
    addIncidentNote: useCallback(
      (incidentId: string, note: string) => {
        if (!note.trim()) return;
        appendTimeline(incidentId, 'note', note.trim());
      },
      [appendTimeline],
    ),
    resolveIncident: useCallback(
      async (incident: IncidentView) => {
        const unresolvedAlerts = incident.alerts.filter((a) => !a.handled);
        if (!unresolvedAlerts.length) return;
        useAppStore.getState().setIsOperatingId(incident.id);
        try {
          await Promise.all(
            unresolvedAlerts.map((a) =>
              updateAlert(a.event_id, { handled: true, handler_note: '控制台闭环处置' }),
            ),
          );
          appendTimeline(incident.id, 'resolved', '事件已闭环');
          await refreshIncidents();
        } catch {
          // handled by caller
        } finally {
          useAppStore.getState().setIsOperatingId('');
        }
      },
      [appendTimeline, refreshIncidents],
    ),
  };
}
