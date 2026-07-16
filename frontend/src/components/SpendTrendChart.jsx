import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

import { formatCurrency } from '../utils/currency';

export function SpendTrendChart({ monthlyBreakdown }) {
  const option = useMemo(() => {
    const months = monthlyBreakdown || [];
    const zoomStart = Math.max(0, 100 - (8 / Math.max(months.length, 1)) * 100);

    return {
      animationDuration: 420,
      color: ['#5fa68e'],
      grid: {
        top: 24,
        right: 22,
        bottom: months.length > 8 ? 88 : 54,
        left: 72,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        backgroundColor: '#172026',
        borderWidth: 0,
        textStyle: {
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        valueFormatter: (value) => formatCurrency(value),
      },
      xAxis: {
        type: 'category',
        data: months.map((entry) => entry.month),
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: {
          color: '#34444b',
          fontWeight: 800,
          interval: 0,
          rotate: months.length > 8 ? 35 : 0,
        },
        axisLine: {
          lineStyle: {
            color: '#9aa8a8',
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#68767a',
          formatter: (value) => formatCurrency(value),
        },
        splitLine: {
          lineStyle: {
            color: '#e1e8e6',
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          start: zoomStart,
          end: 100,
          minValueSpan: 1,
        },
        {
          type: 'slider',
          start: zoomStart,
          end: 100,
          minValueSpan: 1,
          height: 24,
          bottom: 18,
          borderColor: 'rgba(23, 32, 38, 0.12)',
          fillerColor: 'rgba(95, 166, 142, 0.24)',
          handleStyle: {
            color: '#5fa68e',
          },
          textStyle: {
            color: '#68767a',
            fontWeight: 800,
          },
        },
      ],
      series: [
        {
          name: 'Spend',
          type: 'bar',
          data: months.map((entry) => entry.total),
          barMaxWidth: 58,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: '#d96c4a',
              shadowBlur: 12,
              shadowColor: 'rgba(217, 108, 74, 0.32)',
            },
          },
        },
      ],
    };
  }, [monthlyBreakdown]);

  return (
    <ReactECharts
      className="spend-chart"
      option={option}
      notMerge
      lazyUpdate
      opts={{ renderer: 'canvas' }}
    />
  );
}
