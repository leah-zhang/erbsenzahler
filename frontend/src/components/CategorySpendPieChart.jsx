import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

import { getChartTheme } from '../utils/chartTheme';
import { formatCurrency } from '../utils/currency';
import { escapeHtml, renderTransactionGroups } from '../utils/chartTooltip';

function renderTooltip(params) {
  const category = params?.data;

  if (!category) {
    return '';
  }

  return (
    `<div class="chart-tooltip">
      <div class="chart-tooltip-heading">
        <span>${escapeHtml(category.name)}</span>
        <strong>${formatCurrency(category.value)}</strong>
      </div>
      ${renderTransactionGroups([{
        name: category.name,
        total: category.value,
        transactions: category.transactions || [],
      }])}
    </div>`
  );
}

export function CategorySpendPieChart({ categorySpend }) {
  const option = useMemo(() => {
    const categories = categorySpend || [];
    const theme = getChartTheme();

    return {
      animationDuration: 420,
      textStyle: { fontFamily: theme.font },
      color: theme.palette,
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: true,
        backgroundColor: theme.text,
        borderWidth: 0,
        extraCssText: 'max-width: min(520px, calc(100vw - 32px)); white-space: normal;',
        textStyle: {
          color: '#ffffff',
          fontFamily: theme.font,
        },
        formatter: renderTooltip,
      },
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: {
          color: theme.text,
          fontWeight: 600,
        },
      },
      series: [
        {
          name: 'Spend category',
          type: 'pie',
          radius: ['38%', '70%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          data: categories.map((category) => ({
            name: category.name,
            value: category.total,
            transactions: category.transactions,
          })),
          label: {
            color: theme.text,
            fontWeight: 600,
            formatter: ({ name, percent }) => `${name} ${Math.round(percent)}%`,
          },
          itemStyle: {
            borderColor: theme.surface,
            borderWidth: 2,
          },
          emphasis: {
            scaleSize: 8,
          },
        },
      ],
    };
  }, [categorySpend]);

  return (
    <ReactECharts
      className="pie-chart"
      option={option}
      notMerge
      lazyUpdate
      opts={{ renderer: 'canvas' }}
    />
  );
}
