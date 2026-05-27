import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getBackendStatus, WS_URL } from '../api/client';
import AlertPanel from '../components/AlertPanel';
import SimulatorControl from '../components/SimulatorControl';
import type { BackendStatus, CsiMessage } from '../types/csi';

type ConnectionState = 'checking' | 'online' | 'offline';

interface ActivityPoint {
  time: string;
  value: number;
}

const MAX_ACTIVITY_POINTS = 60;

function getStatusText(state: ConnectionState) {
  if (state === 'checking') return '连接中';
  if (state === 'online') return '已连接';
  return '未连接';
}

function formatTimestamp(timestamp?: number) {
  if (typeof timestamp !== 'number') return '--';
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toLocaleTimeString();
}

function formatPercent(value?: number) {
  if (typeof value !== 'number') return '--';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function formatNumber(value?: number) {
  if (typeof value !== 'number') return '--';
  return value.toFixed(2);
}

function Dashboard() {
  const subcarrierChartRef = useRef<HTMLDivElement | null>(null);
  const activityChartRef = useRef<HTMLDivElement | null>(null);
  const subcarrierChart = useRef<echarts.ECharts | null>(null);
  const activityChart = useRef<echarts.ECharts | null>(null);

  const [apiConnectionState, setApiConnectionState] = useState<ConnectionState>('checking');
  const [wsConnectionState, setWsConnectionState] = useState<ConnectionState>('checking');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [wsErrorMessage, setWsErrorMessage] = useState('');
  const [latestMessage, setLatestMessage] = useState<CsiMessage | null>(null);
  const [activityHistory, setActivityHistory] = useState<ActivityPoint[]>([]);
  const [wsVersion, setWsVersion] = useState(0);

  const loadStatus = useCallback(async () => {
    setApiConnectionState('checking');
    setErrorMessage('');

    try {
      const data = await getBackendStatus();
      setStatus(data);
      setApiConnectionState('online');
    } catch (error) {
      const message = error instanceof Error ? error.message : '后端服务连接失败';
      setStatus(null);
      setErrorMessage(message);
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
    setWsErrorMessage('');

    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebSocket 创建失败';
      setWsErrorMessage(message);
      setWsConnectionState('offline');
      return;
    }

    socket.onopen = () => {
      setWsConnectionState('online');
      setWsErrorMessage('');
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
        setWsErrorMessage(message);
      }
    };

    socket.onerror = () => {
      setWsErrorMessage('WebSocket 连接异常，请确认后端服务已启动');
      setWsConnectionState('offline');
    };

    socket.onclose = () => {
      if (!closedByComponent) {
        setWsConnectionState('offline');
        setWsErrorMessage('WebSocket 已断开');
      }
    };

    return () => {
      closedByComponent = true;
      socket?.close();
    };
  }, [wsVersion]);

  useEffect(() => {
    if (!subcarrierChartRef.current || !activityChartRef.current) return;

    subcarrierChart.current = echarts.init(subcarrierChartRef.current);
    activityChart.current = echarts.init(activityChartRef.current);

    const handleResize = () => {
      subcarrierChart.current?.resize();
      activityChart.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      subcarrierChart.current?.dispose();
      activityChart.current?.dispose();
      subcarrierChart.current = null;
      activityChart.current = null;
    };
  }, []);

  const latestFrame = latestMessage?.frame;
  const latestResult = latestMessage?.result;
  const latestSummary = latestMessage?.summary;
  const subcarriers = useMemo(() => latestFrame?.subcarriers ?? [], [latestFrame]);
  const alertActive = Boolean(latestResult?.alert);
  const riskLevel = latestResult?.risk_level ?? '--';
  const riskLevelClass =
    riskLevel === 'high' ? 'metric-value--danger' : riskLevel === 'medium' ? 'metric-value--warning' : '';

  useEffect(() => {
    const chart = subcarrierChart.current;
    if (!chart) return;

    chart.setOption({
      animation: false,
      color: ['#2563eb'],
      grid: { top: 24, right: 16, bottom: 36, left: 48 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        name: '子载波',
        data: subcarriers.map((_, index) => index + 1),
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        name: '幅度',
        scale: true,
      },
      series: [
        {
          type: 'line',
          name: 'Amplitude',
          data: subcarriers,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2 },
        },
      ],
      graphic: subcarriers.length
        ? undefined
        : {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: { text: '等待 CSI 子载波数据', fill: '#64748b', fontSize: 14 },
          },
    });
  }, [subcarriers]);

  useEffect(() => {
    const chart = activityChart.current;
    if (!chart) return;

    chart.setOption({
      animation: false,
      color: ['#0f766e'],
      grid: { top: 24, right: 16, bottom: 36, left: 48 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: activityHistory.map((item) => item.time),
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        name: '活动强度',
        min: 0,
        max: 1,
      },
      series: [
        {
          type: 'line',
          name: 'Activity Score',
          data: activityHistory.map((item) => item.value),
          showSymbol: false,
          smooth: true,
          areaStyle: { opacity: 0.14 },
          lineStyle: { width: 2 },
        },
      ],
      graphic: activityHistory.length
        ? undefined
        : {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: { text: '等待 activity_score 数据', fill: '#64748b', fontSize: 14 },
          },
    });
  }, [activityHistory]);

  return (
    <main className="app-shell">
      {alertActive && (
        <section className="alert-banner" role="alert">
          疑似跌倒告警
          <span>{latestResult?.reason ?? '系统检测到高风险活动，请及时确认老人状态。'}</span>
        </section>
      )}

      <section className="dashboard-header">
        <div>
          <p className="eyebrow">IoT 课程大作业</p>
          <h1>智能 Wi-Fi 非侵入式老年人跌倒监管系统</h1>
          <p className="subtitle">实时 CSI 数据接入、跌倒识别与监管告警前端</p>
        </div>
      </section>

      <section className="status-grid" aria-label="连接状态">
        <div className="status-panel">
          <div>
            <p className="panel-label">后端 API</p>
            <div className="status-line">
              <span className={`status-dot status-dot--${apiConnectionState}`} />
              <strong>{getStatusText(apiConnectionState)}</strong>
            </div>
            {status?.message && <p className="muted-text">{String(status.message)}</p>}
            {errorMessage && <p className="error-text">{errorMessage}</p>}
          </div>

          <button type="button" onClick={loadStatus} disabled={apiConnectionState === 'checking'}>
            刷新
          </button>
        </div>

        <div className="status-panel">
          <div>
            <p className="panel-label">WebSocket 实时数据</p>
            <div className="status-line">
              <span className={`status-dot status-dot--${wsConnectionState}`} />
              <strong>{getStatusText(wsConnectionState)}</strong>
            </div>
            <p className={wsErrorMessage ? 'error-text' : 'muted-text'}>{wsErrorMessage || WS_URL}</p>
          </div>

          <button type="button" onClick={() => setWsVersion((value) => value + 1)}>
            重连
          </button>
        </div>
      </section>

      <SimulatorControl
        status={status}
        onStatusRefresh={(nextStatus) => {
          setStatus(nextStatus);
          setApiConnectionState('online');
          setErrorMessage('');
        }}
      />

      <section className="metric-grid" aria-label="实时识别结果">
        <div className="metric-card">
          <span>当前房间</span>
          <strong>{latestResult?.room ?? latestFrame?.room ?? '--'}</strong>
        </div>
        <div className="metric-card">
          <span>设备 ID</span>
          <strong>{latestResult?.device_id ?? latestFrame?.device_id ?? '--'}</strong>
        </div>
        <div className="metric-card">
          <span>预测状态</span>
          <strong>{latestResult?.predicted_label ?? '--'}</strong>
        </div>
        <div className="metric-card">
          <span>置信度</span>
          <strong>{formatPercent(latestResult?.confidence)}</strong>
        </div>
        <div className="metric-card">
          <span>风险等级</span>
          <strong className={riskLevelClass}>{riskLevel}</strong>
        </div>
        <div className="metric-card">
          <span>活动强度</span>
          <strong>{formatNumber(latestResult?.activity_score)}</strong>
        </div>
      </section>

      <section className="chart-grid" aria-label="CSI 图表">
        <div className="chart-card">
          <div className="chart-title">
            <h2>子载波幅度</h2>
            <span>Frame #{latestFrame?.frame_id ?? '--'}</span>
          </div>
          <div ref={subcarrierChartRef} className="chart-box" />
        </div>

        <div className="chart-card">
          <div className="chart-title">
            <h2>活动强度趋势</h2>
            <span>最近 {activityHistory.length} 帧</span>
          </div>
          <div ref={activityChartRef} className="chart-box" />
        </div>
      </section>

      <section className="summary-panel" aria-label="运行摘要">
        <div>
          <span>总帧数</span>
          <strong>{latestSummary?.total_frames ?? '--'}</strong>
        </div>
        <div>
          <span>告警次数</span>
          <strong>{latestSummary?.alert_count ?? '--'}</strong>
        </div>
        <div>
          <span>最近更新时间</span>
          <strong>{formatTimestamp(latestResult?.timestamp ?? latestFrame?.timestamp)}</strong>
        </div>
      </section>
      <AlertPanel />
    </main>
  );
}

export default Dashboard;
