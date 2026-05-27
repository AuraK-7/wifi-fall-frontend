import { useCallback, useEffect, useState } from 'react';
import { getBackendStatus, WS_URL } from '../api/client';
import type { BackendStatus } from '../types/csi';

type ConnectionState = 'checking' | 'online' | 'offline';

function getStatusText(state: ConnectionState) {
  if (state === 'checking') return '检测中';
  if (state === 'online') return '已连接';
  return '未连接';
}

function Dashboard() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadStatus = useCallback(async () => {
    setConnectionState('checking');
    setErrorMessage('');

    try {
      const data = await getBackendStatus();
      setStatus(data);
      setConnectionState('online');
    } catch (error) {
      const message = error instanceof Error ? error.message : '后端服务连接失败';
      setStatus(null);
      setErrorMessage(message);
      setConnectionState('offline');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <main className="app-shell">
      <section className="dashboard-header">
        <div>
          <p className="eyebrow">IoT 课程大作业</p>
          <h1>智能 Wi-Fi 非侵入式老年人跌倒监管系统</h1>
          <p className="subtitle">实时 CSI 数据接入、跌倒识别与监管告警前端</p>
        </div>
      </section>

      <section className="status-panel" aria-label="后端连接状态">
        <div>
          <p className="panel-label">后端连接状态</p>
          <div className="status-line">
            <span className={`status-dot status-dot--${connectionState}`} />
            <strong>{getStatusText(connectionState)}</strong>
          </div>
        </div>

        <button type="button" onClick={loadStatus} disabled={connectionState === 'checking'}>
          刷新状态
        </button>
      </section>

      <section className="info-grid">
        <div className="info-card">
          <span>API 地址</span>
          <strong>{import.meta.env.VITE_API_BASE_URL}</strong>
        </div>
        <div className="info-card">
          <span>WebSocket 地址</span>
          <strong>{WS_URL}</strong>
        </div>
      </section>

      {status ? (
        <pre className="status-json">{JSON.stringify(status, null, 2)}</pre>
      ) : (
        <p className="error-text">{errorMessage || '等待后端状态返回...'}</p>
      )}
    </main>
  );
}

export default Dashboard;
