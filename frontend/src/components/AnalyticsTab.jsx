import { formatCurrency } from '../utils/currency';
import { SpendTrendChart } from './SpendTrendChart';

export function AnalyticsTab({ summary, topCategoryCount, totalCategories, totalMonths }) {
  return (
    <>
      <section className="summary-grid">
        <article className="metric-card">
          <span>Total spend</span>
          <strong>{formatCurrency(summary?.total_spend)}</strong>
          <small>Across imported transactions</small>
        </article>
        <article className="metric-card">
          <span>Top categories</span>
          <strong>{totalCategories}</strong>
          <small>Ranked by transaction count</small>
        </article>
        <article className="metric-card">
          <span>Months tracked</span>
          <strong>{totalMonths}</strong>
          <small>Based on statement dates</small>
        </article>
      </section>

      <section className="insights-grid">
        <article className="insight-panel trend-panel">
          <div className="panel-heading">
            <p className="eyebrow">Monthly summary</p>
            <h2>Spend trend</h2>
          </div>
          {summary?.monthly_breakdown?.length ? (
            <div className="trend-chart">
              <SpendTrendChart monthlyBreakdown={summary.monthly_breakdown} />
            </div>
          ) : (
            <p className="empty-state">Upload a statement to see monthly spending.</p>
          )}
        </article>

        <article className="insight-panel">
          <div className="panel-heading">
            <p className="eyebrow">Categories</p>
            <h2>Transaction mix</h2>
          </div>
          {summary?.top_categories?.length ? (
            <div className="bar-list">
              {summary.top_categories.map((category) => (
                <div className="bar-row" key={category.name}>
                  <div className="bar-label">
                    <span>{category.name}</span>
                    <strong>{category.count}</strong>
                  </div>
                  <div className="bar-track">
                    <span style={{ width: `${(category.count / topCategoryCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No categorized transactions yet.</p>
          )}
        </article>
      </section>
    </>
  );
}
