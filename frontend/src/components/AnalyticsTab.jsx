import { formatCurrency } from '../utils/currency';
import { CategorySpendPieChart } from './CategorySpendPieChart';
import { SpendTrendChart } from './SpendTrendChart';

export function AnalyticsTab({ summary }) {
  const last30Days = summary?.last_30_days || {};
  const percentDifference = last30Days.percent_difference_vs_last_month;
  const percentDifferenceLabel = percentDifference === null || percentDifference === undefined
    ? 'No previous spend'
    : `${percentDifference > 0 ? '+' : ''}${percentDifference}%`;

  return (
    <>
      <section className="summary-grid">
        <article className="metric-card">
          <span>Total spend</span>
          <strong>{formatCurrency(last30Days.total_spend)}</strong>
          <small>Last 30 days</small>
        </article>
        <article className="metric-card">
          <span>Top merchants</span>
          {last30Days.top_merchants?.length ? (
            <ol className="metric-list">
              {last30Days.top_merchants.map((merchant) => (
                <li key={merchant.name}>
                  <span>{merchant.name}</span>
                  <strong>{merchant.count}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <small>No merchant spend in the last 30 days</small>
          )}
        </article>
        <article className="metric-card">
          <span>Largest transactions</span>
          {last30Days.largest_transactions?.length ? (
            <ol className="metric-list transaction-list">
              {last30Days.largest_transactions.map((transaction) => (
                <li key={`${transaction.date}-${transaction.description}-${transaction.amount}`}>
                  <span>{transaction.description}</span>
                  <strong>{formatCurrency(transaction.amount)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <small>No transactions in the last 30 days</small>
          )}
        </article>
        <article className="metric-card">
          <span>Vs last month</span>
          <strong className={percentDifference > 0 ? 'trend-up' : percentDifference < 0 ? 'trend-down' : ''}>
            {percentDifferenceLabel}
          </strong>
          <small>Previous 30 days: {formatCurrency(last30Days.previous_total_spend)}</small>
        </article>
      </section>

      <section className="insights-grid">
        <article className="insight-panel trend-panel">
          <div className="panel-heading">
            <p className="eyebrow">Last 3 months</p>
            <h2>Weekly spend</h2>
          </div>
          {summary?.weekly_breakdown?.length ? (
            <div className="trend-chart">
              <SpendTrendChart weeklyBreakdown={summary.weekly_breakdown} />
            </div>
          ) : (
            <p className="empty-state">Upload a statement to see weekly spending.</p>
          )}
        </article>

        <article className="insight-panel">
          <div className="panel-heading">
            <p className="eyebrow">Last 30 days</p>
            <h2>Top categories</h2>
          </div>
          {last30Days.top_categories?.length ? (
            <div className="bar-list">
              {last30Days.top_categories.map((category) => (
                <div className="bar-row" key={category.name}>
                  <div className="bar-label">
                    <span>{category.name}</span>
                    <strong>{formatCurrency(category.total)}</strong>
                  </div>
                  <div className="bar-track">
                    <span style={{ width: `${(category.total / Math.max(last30Days.top_categories[0].total, 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No categorized spend in the last 30 days.</p>
          )}
        </article>

        <article className="insight-panel">
          <div className="panel-heading">
            <p className="eyebrow">Last 30 days</p>
            <h2>Spend by category</h2>
          </div>
          {last30Days.category_spend?.length ? (
            <div className="trend-chart">
              <CategorySpendPieChart categorySpend={last30Days.category_spend} />
            </div>
          ) : (
            <p className="empty-state">No categorized spend in the last 30 days.</p>
          )}
        </article>
      </section>
    </>
  );
}
