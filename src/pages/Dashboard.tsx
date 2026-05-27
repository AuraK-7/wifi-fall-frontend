import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBackendStatus, WS_URL } from '../api/client';
import AlertPanel from '../components/AlertPanel';
import RealtimeCharts, { type ActivityPoint } from '../components/RealtimeCharts';
import SimulatorControl from '../components/SimulatorControl';
import StatusOverview from '../components/StatusOverview';
import type { BackendStatus, CsiMessage } from '../types/csi';

type ConnectionState = 'checking' | 'online' | 'offline';

const MAX_ACTIVITY_POINTS = 60;

function getConnectionText(state: ConnectionState) {
  if (state === 'checking') return '连接中';
  if (state === 'online') return '已连接';
  return '未连接';
}

function formatTimestamp(timestamp?: number) {
  if (typeof timestamp !== 'number') return '--';
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toLocaleTimeString();
}

function Dashboard() {
  const [apiConnectionState, setApiConnectionState] = useState<ConnectionState>('checking');
  const [wsConnectionState, setWsConnectionState] = useState<ConnectionState>('checking');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [apiError, setApiError] = useState('');
  const [wsError, setWsError] = useState('');
  const [latestMessage, setLatestMessage] = useState<CsiMessage | null>(null);
  const [activityHistory, setActivityHistory] = useState<ActivityPoint[]>([]);
  const [wsVersion, setWsVersion] = useState(0);

  const loadStatus = useCallback(async () => {
    setApiConnectionState('checking');
    setApiError('');

    try {
      const data = await getBackendStatus();
      setStatus(data);
      setApiConnectionState('online');
    } catch (error) {
      const message = error instanceof Error ? error.message : '后端 API 连接失败';
      setStatus(null);
      setApiError(message);
      setApiConnectionState('offline');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    let closedByComponent = false;
    let socket: WebSocket | null = null;

    setWsConnectionState('checking');
    setWsError('');

    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebSocket 创建失败';
      setWsError(message);
      setWsConnectionState('offline');
      return;
    }

    socket.onopen = () => {
      setWsConnectionState('online');
      setWsError('');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CsiMessage;
        setLatestMessage(data);

        const score = data.result?.activity_score;
        if (typeof score === 'number') {
          setActivityHistory((previous) => [
            ...previous.slice(-(MAX_ACTIVITY_POINTS - 1)),
            {
              time: formatTimestamp(data.result.timestamp),
              value: score,
            },
          ]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'WebSocket 数据解析失败';
        setWsError(message);
      }
    };

    socket.onerror = () => {
      setWsError('WebSocket 连接异常，请确认后端服务已启动');
      setWsConnectionState('offline');
    };

    socket.onclose = () => {
      if (!closedByComponent) {
        setWsConnectionState('offline');
        setWsError('WebSocket 已断开');
      }
    };

    return () => {
      closedByComponent = true;
      socket?.close();
    };
  }, [wsVersion]);

  const frame = latestMessage?.frame;
  const result = latestMessage?.result;
  const subcarriers = useMemo(() => frame?.subcarriers ?? [], [frame]);
  const alertActive = Boolean(result?.alert);

  return (
    <main className="app-shell">
      {alertActive && (
        <section className="alert-banner" role="alert">
          <strong>疑似跌倒告警</strong>
          <span>{result?.reason ?? '系统检测到高风险活动，请及时确认老人状态。'}</span>
        </section>
      )}

      <header className="top-header">
        <div>
          <p className="eyebrow">IoT 课程大作业</p>
          <h1>智能 Wi-Fi 非侵入式老年人跌倒监管系统</h1>
          <p className="subtitle">实时 CSI 监测、跌倒识别、仿真控制与告警处理</p>
        </div>

        <div className="connection-stack" aria-label="连接状态">
          <div className="connection-card">
            <span className={`status-dot status-dot--${apiConnectionState}`} />
            <div>
              <span>后端 API</span>
              <strong>{getConnectionText(apiConnectionState)}</strong>
            </div>
            <button type="button" onClick={loadStatus} disabled={apiConnectionState === 'checking'}>
              刷新
            </button>
          </div>

          <div className="connection-card">
            <span className={`status-dot status-dot--${wsConnectionState}`} />
            <div>
              <span>WebSocket</span>
              <strong>{getConnectionText(wsConnectionState)}</strong>
            </div>
            <button type="button" onClick={() => setWsVersion((value) => value + 1)}>
              重连
            </button>
          </div>
        </div>
      </header>

      {(apiError || wsError) && (
        <section className="message-strip" aria-label="错误提示">
          {apiError && <p>{apiError}</p>}
          {wsError && <p>{wsError}</p>}
        </section>
      )}

      <StatusOverview latestMessage={latestMessage} />

      <RealtimeCharts frameId={frame?.frame_id} subcarriers={subcarriers} activityHistory={activityHistory} />

      <SimulatorControl
        status={status}
        onStatusRefresh={(nextStatus) => {
          setStatus(nextStatus);
          setApiConnectionState('online');
          setApiError('');
        }}
      />

      <AlertPanel />
    </main>
  );
}

export default Dashboard;
