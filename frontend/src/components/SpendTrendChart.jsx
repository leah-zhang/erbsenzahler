import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

import { formatCurrency } from '../utils/currency';
import { escapeHtml, renderTransactionGroups } from '../utils/chartTooltip';

function renderTooltip(params) {
  const point = Array.isArray(params) ? params[0] : params;
  const week = point?.data;

  if (!week) {
    return '';
  }

  return (
    `<div class="chart-tooltip">
      <div class="chart-tooltip-heading">
        <span>${escapeHtml(week.label)}</span>
        <strong>${formatCurrency(week.total)}</strong>
      </div>
      ${renderTransactionGroups(week.merchant_groups)}
    </div>`
  );
}

export function SpendTrendChart({ weeklyBreakdown }) {
  const option = useMemo(() => {
    const weeks = weeklyBreakdown || [];

    return {
      animationDuration: 420,
      color: ['#5fa68e'],
      grid: {
        top: 24,
        right: 22,
        bottom: 54,
        left: 72,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        appendToBody: true,
        confine: true,
        backgroundColor: '#172026',
        borderWidth: 0,
        extraCssText: 'max-width: min(520px, calc(100vw - 32px)); white-space: normal;',
        textStyle: {
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        formatter: renderTooltip,
      },
      xAxis: {
        type: 'category',
        data: weeks.map((entry) => entry.label),
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: {
          color: '#34444b',
          fontWeight: 800,
          interval: 0,
          rotate: weeks.length > 8 ? 35 : 0,
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
      series: [
        {
          name: 'Spend',
          type: 'bar',
          data: weeks.map((entry) => ({
            ...entry,
            value: entry.total,
          })),
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
  }, [weeklyBreakdown]);

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
