import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useAppStore } from '../../store';
import { getThemeColors } from '../../styles/tokens';

interface RiskGaugeProps {
  value: number; // 0–100
  peakValue?: number; // peak in recent window
  height?: number;
}

export default function RiskGauge({ value, peakValue, height = 200 }: RiskGaugeProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const clamped = Math.max(0, Math.min(100, value));
  const chartRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    instanceRef.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    const h = () => instanceRef.current?.resize();
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('resize', h);
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    chart.setOption(
      {
        series: [
          {
            type: 'gauge',
            startAngle: 210,
            endAngle: -30,
            center: ['50%', '55%'],
            radius: '85%',
            min: 0,
            max: 100,
            splitNumber: 10,
            axisLine: {
              show: true,
              lineStyle: {
                width: 18,
                color: [
                  [0.3, c.status.success],   // 0-30 green
                  [0.7, c.status.warning],   // 30-70 yellow
                  [1, c.status.danger],       // 70-100 red
                ],
              },
            },
            pointer: {
              icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
              length: '65%',
              width: 8,
              offsetCenter: [0, '-10%'],
              itemStyle: {
                color: 'auto',
              },
            },
            axisTick: {
              length: 10,
              lineStyle: { color: 'auto', width: 1.5 },
            },
            splitLine: {
              length: 22,
              lineStyle: { color: 'auto', width: 3 },
            },
            axisLabel: {
              color: c.text.muted,
              fontSize: 11,
              distance: -40,
              formatter: (v: number) => {
                if (v === 0) return '平静';
                if (v === 100) return '高危';
                return String(v);
              },
            },
            anchor: {
              show: true,
              showAbove: true,
              size: 18,
              itemStyle: { borderWidth: 2, borderColor: c.border.default },
            },
            title: {
              show: false,
            },
            detail: {
              valueAnimation: true,
              fontSize: 36,
              fontWeight: 'bold',
              offsetCenter: [0, '45%'],
              formatter: '{value}',
              color: clamped > 70 ? c.status.danger : clamped > 30 ? c.status.warning : c.status.success,
            },
            data: [{ value: clamped, name: '扰动指数' }],
          },
        ],
      },
      { notMerge: true },
    );
  }, [value, darkMode]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height, minWidth: 240 }}>
      {/* Left: label + peak */}
      <div style={{ flexShrink: 0, minWidth: 52, paddingLeft: 4 }}>
        <div style={{ fontSize: 11, color: c.text.muted, lineHeight: 1.4 }}>扰动指数</div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2,
          color: clamped > 70 ? c.status.danger : clamped > 30 ? c.status.warning : c.status.success }}>
          {clamped.toFixed(0)}
        </div>
        {typeof peakValue === 'number' && (
          <div style={{ fontSize: 10, color: c.text.muted, marginTop: 1 }}>
            峰值 <strong style={{ color: peakValue > 70 ? c.status.danger : c.text.primary, fontSize: 11 }}>
              {peakValue.toFixed(0)}
            </strong>
          </div>
        )}
      </div>
      {/* Right: gauge chart */}
      <div ref={chartRef} style={{ flex: 1, height: '100%', minWidth: 140 }} />
    </div>
  );
}
