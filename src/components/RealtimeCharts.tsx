import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface ActivityPoint {
  time: string;
  value: number;
}

interface RealtimeChartsProps {
  frameId?: number;
  subcarriers: number[];
  activityHistory: ActivityPoint[];
}

function RealtimeCharts({ frameId, subcarriers, activityHistory }: RealtimeChartsProps) {
  const subcarrierChartRef = useRef<HTMLDivElement | null>(null);
  const activityChartRef = useRef<HTMLDivElement | null>(null);
  const subcarrierChart = useRef<echarts.ECharts | null>(null);
  const activityChart = useRef<echarts.ECharts | null>(null);

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

  useEffect(() => {
    const chart = subcarrierChart.current;
    if (!chart) return;

    chart.setOption({
      animation: false,
      color: ['#2563eb'],
      grid: { top: 24, right: 18, bottom: 38, left: 50 },
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
            style: { text: '暂无 CSI 子载波数据', fill: '#64748b', fontSize: 14 },
          },
    });
  }, [subcarriers]);

  useEffect(() => {
    const chart = activityChart.current;
    if (!chart) return;

    chart.setOption({
      animation: false,
      color: ['#0f766e'],
      grid: { top: 24, right: 18, bottom: 38, left: 50 },
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
            style: { text: '暂无 activity_score 数据', fill: '#64748b', fontSize: 14 },
          },
    });
  }, [activityHistory]);

  return (
    <section className="chart-grid" aria-label="实时 CSI 图表">
      <div className="chart-card">
        <div className="chart-title">
          <h2>CSI 子载波幅度</h2>
          <span>Frame #{frameId ?? '--'}</span>
        </div>
        <div ref={subcarrierChartRef} className="chart-box" />
      </div>

      <div className="chart-card">
        <div className="chart-title">
          <h2>Activity Score 曲线</h2>
          <span>最近 {activityHistory.length} 帧</span>
        </div>
        <div ref={activityChartRef} className="chart-box" />
      </div>
    </section>
  );
}

export default RealtimeCharts;
