import { useEffect, useRef, useMemo } from 'react';
import { Spin } from 'antd';
import * as echarts from 'echarts';
import { useAppStore } from '../../store';
import { getThemeColors } from '../../styles/tokens';

interface SpectrogramHeatmapProps {
  frames: number[][];
  frameIds?: number[];
  loading?: boolean;
  height?: number | string;
}

const MAX_FRAMES = 120;

export default function SpectrogramHeatmap({
  frames,
  frameIds,
  loading = false,
  height = 360,
}: SpectrogramHeatmapProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const resizeTimersRef = useRef<number[]>([]);

  const heatmapData = useMemo(() => {
    const displayFrames = frames.slice(-MAX_FRAMES);
    if (displayFrames.length === 0 || displayFrames[0]?.length === 0) {
      return { data: [] as Array<[number, number, number]>, yMax: 0, xCount: 0, hasData: false };
    }

    const xCount = displayFrames.length;
    const yMax = displayFrames[0].length;

    // Flatten to find global min/max for linear color mapping
    let globalMin = Infinity;
    let globalMax = -Infinity;
    const allValues: number[][] = [];
    for (let fi = 0; fi < xCount; fi++) {
      const row = displayFrames[fi];
      allValues.push(row);
      for (let si = 0; si < yMax; si++) {
        const v = row[si] ?? 0;
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
    }

    // Guard against uniform data
    const range = globalMax - globalMin;
    const effMin = range > 0.0001 ? globalMin : globalMin - 1;
    const effMax = range > 0.0001 ? globalMax : globalMax + 1;
    const effRange = effMax - effMin || 1;

    const data: Array<[number, number, number]> = [];
    for (let x = 0; x < xCount; x++) {
      const row = allValues[x];
      for (let si = 0; si < yMax; si++) {
        const v = row[si] ?? 0;
        // Normalize to [0, 1] — 0 = min (calm), 1 = max (anomaly)
        const normalized = (v - effMin) / effRange;
        data.push([x, si, Math.max(0, Math.min(1, normalized))]);
      }
    }

    return { data, yMax, xCount, hasData: true };
  }, [frames, frameIds]);

  useEffect(() => {
    if (!chartRef.current) return;
    // Ensure container expands correctly
    chartRef.current.style.width = '100%';

    instanceRef.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });

    const resize = () => instanceRef.current?.resize();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;

    // observe both the chart container and its parent to catch layout changes
    if (observer) {
      observer.observe(chartRef.current);
      if (chartRef.current.parentElement) observer.observe(chartRef.current.parentElement);
    }
    window.addEventListener('resize', resize);

    const cleanup = () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      for (const timerId of resizeTimersRef.current) window.clearTimeout(timerId);
      resizeTimersRef.current = [];
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };

    return cleanup;
  }, []);

  // Ensure chart resizes after data changes (give layout a tick)
  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;
    const t = setTimeout(() => chart.resize(), 50);
    return () => clearTimeout(t);
  }, [heatmapData.xCount, heatmapData.yMax, heatmapData.data?.length]);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    const { data, yMax, xCount, hasData } = heatmapData;

    if (!hasData || yMax === 0) {
      chart.setOption({
        graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '等待 CSI 数据...', fill: c.text.muted, fontSize: 13 } },
      }, { notMerge: true });
      return;
    }

    const labelStep = Math.max(1, Math.floor(xCount / 10));
    const xLabels = frameIds && frameIds.length >= xCount
      ? frameIds.slice(-xCount).map((id, i) => i % labelStep === 0 ? String(id) : '')
      : Array.from({ length: xCount }, (_, i) => i % labelStep === 0 ? String(i + 1) : '');

    const yLabelStep = Math.max(1, Math.floor(yMax / 8));

    const windowSize = Math.max(10, Math.min(60, Math.floor(xCount / 2) || 20));
    const startPct = xCount <= windowSize ? 0 : Math.max(0, ((xCount - windowSize) / xCount) * 100);

    chart.setOption({
      animationDurationUpdate: 200,
      // increase bottom to make room for dataZoom / visualMap labels
      grid: { top: 18, right: 20, bottom: 88, left: 52, containLabel: true },
      tooltip: {
        renderMode: 'richText',
        backgroundColor: 'rgba(18, 28, 47, 0.96)',
        borderColor: c.border.default,
        textStyle: { color: c.text.primary, fontSize: 11 },
        formatter(params: unknown) {
          const p = params as { value: [number, number, number] };
          if (!p || !p.value) return '';
          const [, scIdx, normalized] = p.value;
          const pct = Math.round(normalized * 100);
          const level = pct > 70 ? '⚠ 高' : pct > 35 ? '● 中' : '○ 低';
          const clr = pct > 70 ? c.status.danger : pct > 35 ? c.status.warning : c.status.success;
          return `<div style="font-size:11px">子载波<strong>#${scIdx}</strong> · 强度: <strong style="color:${clr}">${pct}%</strong> <span style="color:${clr}">${level}</span></div>`;
        },
      },
      xAxis: {
        type: 'category', data: xLabels, boundaryGap: true,
        name: '帧', nameTextStyle: { color: c.text.muted, fontSize: 9 },
        axisLabel: { color: c.text.muted, fontSize: 8, interval: 0 },
        axisLine: { lineStyle: { color: c.border.muted } }, splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: Array.from({ length: yMax }, (_, i) => i % yLabelStep === 0 ? String(i) : ''),
        name: '子载波', nameTextStyle: { color: c.text.muted, fontSize: 9 },
        axisLabel: { color: c.text.muted, fontSize: 8, interval: 0 },
        axisLine: { lineStyle: { color: c.border.muted } }, splitLine: { show: false },
      },
      visualMap: {
        min: 0, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 36,
        textStyle: { color: c.text.muted, fontSize: 9 },
        inRange: { color: ['#0a1628', '#1a3a5c', '#0f766e', '#eab308', '#ef4444'] },
        itemWidth: 10, itemHeight: 70,
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: startPct, end: 100 },
        { type: 'slider', xAxisIndex: 0, start: startPct, end: 100, bottom: 8, height: 10 }
      ],
      series: [{
        type: 'heatmap', data,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(239, 68, 68, 0.5)' } },
        itemStyle: { borderColor: 'rgba(10, 18, 32, 0.4)', borderWidth: 0.5 },
      }],
    }, { notMerge: true });

    // Auto-follow last frames: update dataZoom to show the trailing window
    try {
      chart.dispatchAction({
        type: 'dataZoom',
        start: startPct,
        end: 100,
      });
    } catch (e) {
      // ignore
    }

    requestAnimationFrame(() => chart.resize());
    resizeTimersRef.current.push(window.setTimeout(() => chart.resize(), 80));
    resizeTimersRef.current.push(window.setTimeout(() => chart.resize(), 220));
  }, [heatmapData, frameIds, darkMode]);

  const containerHeight = typeof height === 'number' ? height : height;

  return (
    <div style={{ position: 'relative', height: containerHeight, width: '100%', display: 'flex', alignItems: 'stretch' }}>
      {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, background: darkMode ? 'rgba(10, 18, 32, 0.6)' : 'rgba(245, 247, 250, 0.6)' }}><Spin /></div>}
      <div ref={chartRef} style={{ height: '100%', width: '100%', flex: 1, minWidth: 0, display: 'block' }} />
    </div>
  );
}
