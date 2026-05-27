import type { CsiMessage } from '../types/csi';

interface StatusOverviewProps {
  latestMessage: CsiMessage | null;
}

function formatPercent(value?: number) {
  if (typeof value !== 'number') return '--';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function getRiskClass(riskLevel?: string) {
  if (riskLevel === 'high') return 'status-card--danger';
  if (riskLevel === 'medium') return 'status-card--warning';
  if (riskLevel === 'low') return 'status-card--success';
  return '';
}

function StatusOverview({ latestMessage }: StatusOverviewProps) {
  const frame = latestMessage?.frame;
  const result = latestMessage?.result;
  const summary = latestMessage?.summary;
  const riskLevel = result?.risk_level ?? '--';

  return (
    <section className="overview-grid" aria-label="实时状态概览">
      <article className="status-card">
        <span>当前活动状态</span>
        <strong>{result?.predicted_label ?? '--'}</strong>
        <p>置信度 {formatPercent(result?.confidence)}</p>
      </article>

      <article className={`status-card ${getRiskClass(result?.risk_level)}`}>
        <span>风险等级</span>
        <strong>{riskLevel}</strong>
        <p>{result?.alert ? '需要立即确认' : '持续监测中'}</p>
      </article>

      <article className="status-card">
        <span>房间 / 设备</span>
        <strong>{result?.room ?? frame?.room ?? '--'}</strong>
        <p>{result?.device_id ?? frame?.device_id ?? '--'}</p>
      </article>

      <article className="status-card">
        <span>累计告警</span>
        <strong>{summary?.alert_count ?? '--'}</strong>
        <p>总帧数 {summary?.total_frames ?? '--'}</p>
      </article>
    </section>
  );
}

export default StatusOverview;
