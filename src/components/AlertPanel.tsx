import { useCallback, useEffect, useState } from 'react';
import { getAlerts, getAlertSummaryCount, updateAlert } from '../api/client';
import type { AlertEvent, AlertSummaryCount } from '../types/csi';

const DEFAULT_SUMMARY: AlertSummaryCount = {
  total: 0,
  handled: 0,
  unhandled: 0,
};

function formatAlertTime(value: AlertEvent['timestamp']) {
  if (typeof value === 'number') {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toLocaleString();
  }

  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatConfidence(value: number) {
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '告警操作失败，请检查后端服务';
}

function AlertPanel() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [summary, setSummary] = useState<AlertSummaryCount>(DEFAULT_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);
  const [operatingEventId, setOperatingEventId] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setNotice('');
    setErrorMessage('');

    try {
      const [nextAlerts, nextSummary] = await Promise.all([getAlerts(), getAlertSummaryCount()]);
      setAlerts(nextAlerts);
      setSummary(nextSummary);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const handleMarkHandled = async (eventId: string) => {
    setOperatingEventId(eventId);
    setNotice('');
    setErrorMessage('');

    try {
      await updateAlert(eventId, {
        handled: true,
        handler_note: '已确认老人安全',
      });
      await loadAlerts();
      setNotice('告警已标记为已处理');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setOperatingEventId('');
    }
  };

  return (
    <section className="alert-panel" aria-label="告警记录">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>告警记录</h2>
        </div>
        <button type="button" onClick={() => void loadAlerts()} disabled={isLoading}>
          刷新告警
        </button>
      </div>

      <div className="alert-summary-grid">
        <div className="alert-summary-card">
          <span>total</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="alert-summary-card">
          <span>handled</span>
          <strong>{summary.handled}</strong>
        </div>
        <div className="alert-summary-card alert-summary-card--warning">
          <span>unhandled</span>
          <strong>{summary.unhandled}</strong>
        </div>
      </div>

      {notice && <p className="success-text">{notice}</p>}
      {errorMessage && <p className="error-text">{errorMessage}</p>}

      <div className="alert-table-wrap">
        <table className="alert-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>房间</th>
              <th>设备 ID</th>
              <th>预测状态</th>
              <th>置信度</th>
              <th>风险等级</th>
              <th>是否已处理</th>
              <th>原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.event_id} className={alert.handled ? undefined : 'alert-row--unhandled'}>
                <td>{formatAlertTime(alert.timestamp)}</td>
                <td>{alert.room || '--'}</td>
                <td>{alert.device_id || '--'}</td>
                <td>{alert.predicted_label || '--'}</td>
                <td>{formatConfidence(alert.confidence)}</td>
                <td>
                  <span className={`risk-pill risk-pill--${alert.risk_level}`}>{alert.risk_level || '--'}</span>
                </td>
                <td>
                  <span className={alert.handled ? 'handled-pill' : 'unhandled-pill'}>
                    {alert.handled ? '已处理' : '未处理'}
                  </span>
                </td>
                <td className="reason-cell">{alert.reason || '--'}</td>
                <td>
                  {!alert.handled ? (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => void handleMarkHandled(alert.event_id)}
                      disabled={operatingEventId === alert.event_id}
                    >
                      标记已处理
                    </button>
                  ) : (
                    <span className="muted-text">无需操作</span>
                  )}
                </td>
              </tr>
            ))}
            {!alerts.length && (
              <tr>
                <td colSpan={9} className="empty-table-cell">
                  {isLoading ? '正在加载告警记录...' : '暂无告警记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AlertPanel;
