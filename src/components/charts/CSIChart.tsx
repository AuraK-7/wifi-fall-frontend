import { useEffect, useRef, useCallback } from 'react';
import { Spin } from 'antd';
import * as echarts from 'echarts';
import { useAppStore } from '../../store';
import { getThemeColors, thresholds } from '../../styles/tokens';

interface BrushSelectRange {
  startRatio: number;
  endRatio: number;
}

interface CSIChartProps {
  frameId?: number;
  subcarriers: number[];
  alertActive?: boolean;
  enableBrush?: boolean;
  onBrushSelect?: (range: BrushSelectRange | null) => void;
  loading?: boolean;
  height?: number;
  /** Additional subcarrier arrays for multi-device comparison */
  comparisonSeries?: Array<{ name: string; data: number[]; color: string }>;
}

export default function CSIChart({
  frameId,
  subcarriers,
  alertActive = false,
  enableBrush = false,
  onBrushSelect,
  loading = false,
  height = 260,
  comparisonSeries = [],
}: CSIChartProps) {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  // Compute mean and std for threshold
  const ampMean = subcarriers.length > 0
    ? subcarriers.reduce((s, v) => s + v, 0) / subcarriers.length
    : 0;
  const ampStd = subcarriers.length > 1
    ? Math.sqrt(subcarriers.reduce((s, v) => s + (v - ampMean) ** 2, 0) / subcarriers.length)
    : 0;
  const upperThreshold = ampMean + 2 * ampStd;
  const lowerThreshold = ampMean - 2 * ampStd;

  // Highlight points exceeding threshold
  const highlightData = subcarriers.map((v, i) => ({
    value: [i + 1, v],
    itemStyle: { color: Math.abs(v - ampMean) > 2 * ampStd ? c.status.danger : 'transparent' },
    symbolSize: Math.abs(v - ampMean) > 2 * ampStd ? 6 : 0,
  }));

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;

    if (enableBrush && onBrushSelect) {
      chart.on('brushEnd', (params: unknown) => {
        const bp = params as { areas?: Array<{ coordRange?: number[][] }> };
        if (!bp.areas || bp.areas.length === 0) {
          onBrushSelect(null);
          return;
        }
        const area = bp.areas[0];
        const range = area.coordRange;
        if (range && range.length >= 2) {
          const total = subcarriers.length || 1;
          onBrushSelect({
            startRatio: Math.max(0, range[0][0] / total),
            endRatio: Math.min(1, range[1][0] / total),
          });
        }
      });
      // Double-click to clear brush
      chart.on('dblclick', () => {
        chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } });
        onBrushSelect(null);
      });
    }

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.off('brushEnd');
      chart.off('dblclick');
      chart.dispose();
      instanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    const baseSeries: Record<string, unknown>[] = [
      {
        type: 'line',
        name: 'Amplitude',
        data: subcarriers,
        showSymbol: false,
        smooth: 0.28,
        lineStyle: { width: 1.8 },
        markLine: subcarriers.length > 0 ? {
          symbol: 'none',
          silent: true,
          label: { show: true, color: c.chart.threshold, fontSize: 10, formatter: '{b}' },
          lineStyle: { width: 1, type: 'dashed' as const, opacity: 0.7, color: c.chart.threshold },
          data: [
            { yAxis: upperThreshold, name: `μ+2σ ${upperThreshold.toFixed(2)}` },
            { yAxis: lowerThreshold, name: `μ-2σ ${lowerThreshold.toFixed(2)}` },
          ],
        } : undefined,
        markArea: alertActive ? {
          silent: true,
          label: { show: false },
          data: [[
            { xAxis: 0, itemStyle: { color: 'rgba(239, 91, 107, 0.12)' } },
            { xAxis: subcarriers.length },
          ]],
        } : undefined,
      },
      // Overlay threshold-exceeding points as scatter
      {
        type: 'scatter',
        name: 'Anomaly',
        data: highlightData.filter((d) => d.itemStyle.color !== 'transparent'),
        symbolSize: 6,
        itemStyle: { color: c.status.danger },
        zlevel: 1,
      },
    ];

    // Add comparison series
    for (const comp of comparisonSeries) {
      baseSeries.push({
        type: 'line',
        name: comp.name,
        data: comp.data,
        showSymbol: false,
        smooth: 0.28,
        lineStyle: { width: 1.2, opacity: 0.5, color: comp.color },
        itemStyle: { opacity: 0.5 },
      });
    }

    const options: Record<string, unknown> = {
      animationDurationUpdate: 200,
      color: [c.chart.csi],
      grid: { top: 32, right: 24, bottom: enableBrush ? 60 : 40, left: 56 },
      toolbox: enableBrush ? {
        feature: {
          brush: { type: ['lineX', 'clear'] },
          restore: { show: true, title: '还原' },
        },
        top: 2,
        right: 8,
      } : undefined,
      brush: enableBrush ? {
        xAxisIndex: 0,
        brushLink: 'none',
        outOfBrush: { colorAlpha: 0.3 },
      } : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(18, 28, 47, 0.96)',
        borderColor: c.border.default,
        textStyle: { color: c.text.primary, fontSize: 12 },
        formatter(params: unknown) {
          const items = params as Array<{ seriesIndex: number; seriesName: string; name: string; value: number | [number, number] }>;
          if (!Array.isArray(items) || items.length === 0) return '';
          const lineItem = items.find((i) => i.seriesName === 'Amplitude');
          if (!lineItem) return '';
          const val = Array.isArray(lineItem.value) ? lineItem.value[1] : lineItem.value;
          const over = Math.abs(val - ampMean) > 2 * ampStd;
          return `
            <div style="font-size:12px">
              子载波: <strong>${lineItem.name}</strong><br/>
              幅度: <strong style="color:${over ? c.status.danger : c.chart.csi}">${typeof val === 'number' ? val.toFixed(4) : val}</strong>
              ${over ? `<br/><span style="color:${c.status.danger};font-size:11px">⚠ 超过阈值 (μ±2σ)</span>` : ''}
              <br/>帧: #${frameId ?? '--'}
            </div>`;
        },
      },
      xAxis: {
        type: 'category',
        name: 'Subcarrier',
        nameTextStyle: { color: c.text.muted, fontSize: 11 },
        data: subcarriers.map((_, i) => i + 1),
        boundaryGap: false,
        axisLine: { lineStyle: { color: c.border.muted } },
        axisTick: { show: false },
        axisLabel: { color: c.text.muted, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Amplitude',
        nameTextStyle: { color: c.text.muted, fontSize: 11 },
        scale: true,
        splitLine: { lineStyle: { color: 'rgba(142,164,189,0.08)' } },
        axisLabel: { color: c.text.muted, fontSize: 10 },
      },
      series: baseSeries,
    };

    if (enableBrush) {
      options.dataZoom = [
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 20,
          bottom: 6,
          borderColor: c.border.default,
          backgroundColor: c.bg.surface,
          fillerColor: 'rgba(74, 168, 255, 0.15)',
          handleStyle: { color: c.status.info },
          textStyle: { color: c.text.muted, fontSize: 10 },
        },
      ];
    }

    chart.setOption(options, { notMerge: true });
  }, [subcarriers, frameId, alertActive, enableBrush, comparisonSeries, ampMean, ampStd, upperThreshold, lowerThreshold]);

  // Clear brush when subcarriers change
  useEffect(() => {
    instanceRef.current?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: false },
    });
  }, [subcarriers]);

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
