import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';

import { formatCurrency } from '../utils/currency';
import { escapeHtml, renderCategoryTransactionGroups, renderTransactionGroups } from '../utils/chartTooltip';

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
      ${week.category_groups?.length ? renderCategoryTransactionGroups(week.category_groups) : renderTransactionGroups(week.merchant_groups)}
    </div>`
  );
}

export function SpendTrendChart({ weeklyBreakdown }) {
  const chartRef = useRef(null);
  const chartClickKeepsTooltipRef = useRef(false);
  const [isTooltipPinned, setIsTooltipPinned] = useState(false);

  const hideTooltip = useCallback(() => {
    setIsTooltipPinned(false);
    window.setTimeout(() => {
      chartRef.current?.getEchartsInstance()?.dispatchAction({ type: 'hideTip' });
    }, 0);
  }, []);

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
        trigger: 'item',
        triggerOn: 'click',
        enterable: true,
        alwaysShowContent: isTooltipPinned,
        appendToBody: true,
        confine: true,
        position: (point, params, dom, rect, size) => {
          const tooltipWidth = size.contentSize[0];
          const tooltipHeight = size.contentSize[1];
          const viewWidth = size.viewSize[0];
          const viewHeight = size.viewSize[1];
          const x = point[0] + tooltipWidth + 24 > viewWidth
            ? Math.max(12, point[0] - tooltipWidth - 16)
            : point[0] + 16;
          const y = Math.min(
            Math.max(12, point[1] - tooltipHeight / 2),
            Math.max(12, viewHeight - tooltipHeight - 12),
          );
          return [x, y];
        },
        backgroundColor: '#172026',
        borderWidth: 0,
        extraCssText: 'max-width: min(520px, calc(100vw - 32px)); max-height: min(420px, calc(100vh - 48px)); overflow-y: auto; white-space: normal;',
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
  }, [isTooltipPinned, weeklyBreakdown]);

  useEffect(() => {
    const dismissTooltip = (event) => {
      window.setTimeout(() => {
        const target = event.target;
        if (target.closest?.('.chart-tooltip') || chartClickKeepsTooltipRef.current) {
          chartClickKeepsTooltipRef.current = false;
          return;
        }

        hideTooltip();
      }, 0);
    };

    document.addEventListener('click', dismissTooltip);
    return () => document.removeEventListener('click', dismissTooltip);
  }, [hideTooltip]);

  const onEvents = useMemo(() => ({
    click: (params) => {
      chartClickKeepsTooltipRef.current = params?.componentType === 'series';
      if (chartClickKeepsTooltipRef.current) {
        setIsTooltipPinned(true);
        window.setTimeout(() => {
          chartRef.current?.getEchartsInstance()?.dispatchAction({
            type: 'showTip',
            seriesIndex: params.seriesIndex,
            dataIndex: params.dataIndex,
          });
        }, 0);
      } else {
        hideTooltip();
      }
    },
  }), [hideTooltip]);

  return (
    <div>
      <ReactECharts
        ref={chartRef}
        className="spend-chart"
        option={option}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
        onEvents={onEvents}
      />
    </div>
  );
}
