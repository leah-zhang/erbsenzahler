import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

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

    return {
      animationDuration: 420,
      color: ['#5fa68e', '#d96c4a', '#3f6f8f', '#b88b4a', '#8f5fa6', '#7a8f5f', '#8f2d2d'],
      tooltip: {
        trigger: 'item',
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
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: {
          color: '#34444b',
          fontWeight: 800,
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
            color: '#34444b',
            fontWeight: 800,
            formatter: ({ name, percent }) => `${name} ${Math.round(percent)}%`,
          },
          itemStyle: {
            borderColor: '#ffffff',
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
