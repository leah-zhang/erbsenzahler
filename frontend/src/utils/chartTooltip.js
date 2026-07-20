import { formatCurrency } from './currency';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderTransactionGroups(groups) {
  if (!groups?.length) {
    return '<div class="chart-tooltip-empty">No transactions</div>';
  }

  return groups.map((group) => {
    const transactions = (group.transactions || [])
      .map((transaction) => (
        `<div class="chart-tooltip-transaction">
          <span>${escapeHtml(transaction.description)}</span>
          <strong>${formatCurrency(transaction.amount)}</strong>
        </div>`
      ))
      .join('');

    return (
      `<div class="chart-tooltip-group">
        <div class="chart-tooltip-group-heading">
          <span>${escapeHtml(group.name)}</span>
          <strong>${formatCurrency(group.total)}</strong>
        </div>
        ${transactions}
      </div>`
    );
  }).join('');
}
