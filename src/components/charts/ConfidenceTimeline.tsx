import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useAppStore } from '../../store';
import { getThemeColors, thresholds } from '../../styles/tokens';

interface ConfidenceTimelineProps {
  points: Array<{ confidence: number; label: string; time: string }>;
  height?: number;
}

export default function ConfidenceTimeline({ points, height = 100 }: ConfidenceTimelineProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    instanceRef.current = echarts.init(chartRef.current);
    const h = () => instanceRef.current?.resize();
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); instanceRef.current?.dispose(); instanceRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;
    if (points.length === 0) {
      chart.setOption({ graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '等待数据...', fill: c.text.muted, fontSize: 10 } } }, { notMerge: true });
      return;
    }

    const data = points.map((p) => p.confidence);
    const times = points.map((p) => p.time);

    chart.setOption({
      animationDurationUpdate: 150,
      grid: { top: 8, right: 8, bottom: 20, left: 36 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(18, 28, 47, 0.96)', borderColor: c.border.default, textStyle: { color: c.text.primary, fontSize: 10 } },
      xAxis: { type: 'category', data: times, show: false },
      yAxis: { type: 'value', min: 0, max: 1, splitLine: { show: false }, axisLabel: { show: false }, axisTick: { show: false } },
      series: [{
        type: 'line', data, showSymbol: false, smooth: 0.3,
        lineStyle: { width: 1.5, color: c.chart.activity },
        areaStyle: { opacity: 0.15, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.status.danger }, { offset: 1, color: c.chart.activity }]) },
        markLine: { silent: true, symbol: 'none', lineStyle: { width: 1, type: 'dashed', color: c.status.danger, opacity: 0.6 }, data: [{ yAxis: thresholds.fallConfidence }], label: { show: false } },
        markPoint: { symbolSize: 14, symbol: 'pin', data: data.map((v, i) => v >= thresholds.fallConfidence ? { coord: [i, v] } : null).filter(Boolean).slice(-3), itemStyle: { color: c.status.danger } },
      }],
    }, { notMerge: true });
  }, [points, darkMode]);

  return <div ref={chartRef} style={{ height, width: '100%' }} />;
}
