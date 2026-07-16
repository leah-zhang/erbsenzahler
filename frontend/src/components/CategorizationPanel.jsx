const predefinedCategories = [
  'Groceries',
  'Dining',
  'Coffee',
  'Transportation',
  'Shopping',
  'Bills',
  'Subscriptions',
  'Healthcare',
  'Entertainment',
  'Travel',
];

export function CategorizationPanel({
  categoryOptions,
  customCategories,
  groups,
  hasMore,
  isCategorizing,
  onApplyCategory,
  onCustomCategoryChange,
  onPageChange,
  page,
  pageSize,
  total,
}) {
  if (!groups.length) {
    return null;
  }

  const categories = Array.from(new Set([...predefinedCategories, ...categoryOptions]))
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));
  const firstItem = page * pageSize + 1;
  const lastItem = Math.min((page + 1) * pageSize, total);

  return (
    <div className="categorization-panel">
      <div className="panel-heading">
        <p className="eyebrow">Categorize</p>
        <h2>Map merchants</h2>
        <small>{firstItem}-{lastItem} of {total} uncategorized merchants</small>
      </div>

      <div className="merchant-list">
        {groups.map((group) => {
          const customCategory = customCategories[group.merchant_key] || '';

          return (
            <div className="merchant-row" key={group.merchant_key}>
              <div>
                <strong>{group.display_name}</strong>
                <span>{group.count} transaction{group.count === 1 ? '' : 's'}</span>
                <small>{group.examples.join(' / ')}</small>
              </div>

              <div className="category-actions">
                <select
                  defaultValue=""
                  disabled={isCategorizing}
                  onChange={(event) => {
                    if (event.target.value) {
                      onApplyCategory(group.merchant_key, event.target.value);
                      event.target.value = '';
                    }
                  }}
                >
                  <option value="">Choose category</option>
                  {categories.map((category) => (
                    <option value={category} key={`${group.merchant_key}-${category}`}>
                      {category}
                    </option>
                  ))}
                </select>

                <div className="custom-category">
                  <input
                    type="text"
                    value={customCategory}
                    placeholder="Custom category"
                    disabled={isCategorizing}
                    onChange={(event) => onCustomCategoryChange(group.merchant_key, event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={isCategorizing || !customCategory.trim()}
                    onClick={() => onApplyCategory(group.merchant_key, customCategory)}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pagination-controls">
        <button type="button" disabled={isCategorizing || page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button type="button" disabled={isCategorizing || !hasMore} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
