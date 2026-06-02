import { useEffect, useRef } from 'react';
import { Spin } from 'antd';
import * as echarts from 'echarts';
import { useAppStore } from '../../store';
import { getThemeColors, thresholds as th } from '../../styles/tokens';
import type { ActivityPoint } from '../../store';

interface ActivityChartProps {
  data: ActivityPoint[];
  loading?: boolean;
  height?: number;
}

export default function ActivityChart({ data, loading = false, height = 220 }: ActivityChartProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    instanceRef.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    const handleResize = () => instanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    // Compute threshold-exceeding points
    const highPoints = data
      .map((item, index) => ({ ...item, index }))
      .filter((item) => item.value >= th.activityHigh);

    chart.setOption(
      {
        animationDurationUpdate: 200,
        color: [c.chart.activity],
        grid: { top: 32, right: 24, bottom: 60, left: 56 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(18, 28, 47, 0.96)',
          borderColor: c.border.default,
          textStyle: { color: c.text.primary, fontSize: 12 },
          formatter(params: unknown) {
            const items = params as Array<{ name: string; value: number }>;
            if (!Array.isArray(items) || items.length === 0) return '';
            const v = items[0].value;
            const over = v >= th.activityHigh;
            return `
              <div style="font-size:12px">
                时间: ${items[0].name}<br/>
                活动分值: <strong style="color:${over ? c.status.danger : c.chart.activity}">${v.toFixed(3)}</strong>
                ${over ? `<br/><span style="color:${c.status.danger};font-size:11px">⚠ 超过高风险阈值</span>` : ''}
              </div>`;
          },
        },
        xAxis: {
          type: 'category',
          data: data.map((item) => item.time),
          boundaryGap: false,
          axisLine: { lineStyle: { color: c.border.muted } },
          axisTick: { show: false },
          axisLabel: { color: c.text.muted, fontSize: 10, rotate: data.length > 30 ? 45 : 0 },
        },
        yAxis: {
          type: 'value',
          name: 'Activity',
          nameTextStyle: { color: c.text.muted, fontSize: 11 },
          min: 0,
          max: 1,
          splitLine: { lineStyle: { color: 'rgba(142,164,189,0.08)' } },
          axisLabel: { color: c.text.muted, fontSize: 10 },
        },
        dataZoom: data.length > 30 ? [
          {
            type: 'slider',
            start: data.length > 60 ? Math.max(0, ((data.length - 60) / data.length) * 100) : 0,
            end: 100,
            height: 20,
            bottom: 6,
            borderColor: c.border.default,
            backgroundColor: c.bg.surface,
            fillerColor: 'rgba(74, 168, 255, 0.15)',
            handleStyle: { color: c.status.info },
            textStyle: { color: c.text.muted, fontSize: 10 },
          },
        ] : undefined,
        series: [
          {
            type: 'line',
            name: 'Activity',
            data: data.map((item) => item.value),
            showSymbol: false,
            smooth: 0.2,
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.15 },
            markLine: {
              symbol: 'none',
              silent: true,
              label: { show: true, color: c.chart.threshold, fontSize: 10, formatter: '{b}' },
              lineStyle: { width: 1.2, type: 'dashed' as const, opacity: 0.7, color: c.chart.threshold },
              data: [
                { yAxis: th.activityLow, name: `Low ${th.activityLow}` },
                { yAxis: th.activityHigh, name: `High ${th.activityHigh}` },
              ],
            },
            markPoint: {
              symbolSize: 20,
              symbol: 'pin',
              data: highPoints.slice(-6).map((p) => ({
                name: p.time,
                value: p.value,
                coord: [p.index, p.value],
              })),
              itemStyle: { color: c.status.danger },
            },
          },
        ],
      },
      { notMerge: true },
    );
  }, [data, darkMode]);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 2, background: 'rgba(10, 18, 32, 0.6)',
        }}>
          <Spin />
        </div>
      )}
      <div ref={chartRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
