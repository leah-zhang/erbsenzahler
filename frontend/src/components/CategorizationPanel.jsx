export function CategorizationPanel({
  categoryDetails,
  categoryGroupExclusions,
  categoryOptions,
  customCategories,
  isCategorizing,
  onApplyCategory,
  onApplySelectedCategories,
  onClearSelectedUncategorizedGroups,
  onCustomCategoryChange,
  onExcludeUncategorizedMerchant,
  onToggleUncategorizedGroup,
  onToggleVisibleUncategorizedGroups,
  onUncategorizedPageChange,
  selectedUncategorizedGroups,
  uncategorizedPage,
  uncategorizedPageSize,
}) {
  const allCategories = [...categoryOptions].sort((left, right) => left.localeCompare(right));
  const uncategorizedTotal = categoryDetails.uncategorized_total || 0;
  const uncategorizedFirstItem = uncategorizedTotal ? uncategorizedPage * uncategorizedPageSize + 1 : 0;
  const uncategorizedLastItem = Math.min((uncategorizedPage + 1) * uncategorizedPageSize, uncategorizedTotal);
  const batchCustomCategory = customCategories.__batch_uncategorized__ || '';
  const visibleSelectableMerchantKeys = (categoryDetails.uncategorized_groups || [])
    .filter((group) => {
      const excludedMerchants = categoryGroupExclusions[group.merchant_key] || [];
      return group.merchants.some((merchant) => !excludedMerchants.includes(merchant));
    })
    .map((group) => group.merchant_key);
  const areAllVisibleSelected = Boolean(visibleSelectableMerchantKeys.length)
    && visibleSelectableMerchantKeys.every((merchantKey) => selectedUncategorizedGroups.includes(merchantKey));


  return (
        <details className="category-dropdown uncategorized-dropdown" open>
          <summary className="category-row">
            <div>
              <strong><span className="dropdown-arrow" aria-hidden="true" />Uncategorized</strong>
              <span>
                {uncategorizedTotal
                  ? `${uncategorizedFirstItem}-${uncategorizedLastItem} of ${uncategorizedTotal} merchant groups`
                  : '0 merchant groups'}
              </span>
            </div>
          </summary>

          <div className="category-dropdown-body">
            {categoryDetails.uncategorized_groups?.length ? (
              <div className="batch-category-toolbar">
                <div>
                  <label className="select-all-merchants">
                    <input
                      type="checkbox"
                      checked={areAllVisibleSelected}
                      disabled={isCategorizing || !visibleSelectableMerchantKeys.length}
                      onChange={() => onToggleVisibleUncategorizedGroups(visibleSelectableMerchantKeys)}
                    />
                    <span>Select all visible</span>
                  </label>
                  <small>{selectedUncategorizedGroups.length} selected</small>
                </div>
                <div className="category-actions">
                  <select
                    disabled={isCategorizing || !selectedUncategorizedGroups.length}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        onApplySelectedCategories(selectedUncategorizedGroups, event.target.value);
                        event.target.value = '';
                      }
                    }}
                  >
                    <option value="">Assign selected</option>
                    {allCategories.map((category) => (
                      <option value={category} key={`batch-${category}`}>
                        {category}
                      </option>
                    ))}
                  </select>

                  <div className="custom-category">
                    <input
                      type="text"
                      value={batchCustomCategory}
                      placeholder="Custom category"
                      disabled={isCategorizing || !selectedUncategorizedGroups.length}
                      onChange={(event) => onCustomCategoryChange('__batch_uncategorized__', event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={isCategorizing || !selectedUncategorizedGroups.length || !batchCustomCategory.trim()}
                      onClick={() => onApplySelectedCategories(selectedUncategorizedGroups, batchCustomCategory)}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <button
                  className="clear-selection-button"
                  type="button"
                  disabled={!selectedUncategorizedGroups.length}
                  onClick={onClearSelectedUncategorizedGroups}
                >
                  Clear
                </button>
              </div>
            ) : null}

            {categoryDetails.uncategorized_groups?.length ? (
              categoryDetails.uncategorized_groups.map((group) => {
                const excludedMerchants = categoryGroupExclusions[group.merchant_key] || [];
                const visibleMerchants = group.merchants.filter((merchant) => !excludedMerchants.includes(merchant));
                const isSelected = selectedUncategorizedGroups.includes(group.merchant_key);

                return (
                  <details className="merchant-group-dropdown" key={`uncategorized-${group.merchant_key}`}>
                    <summary>
                      <div className="selectable-merchant-heading">
                        <label className="merchant-select" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isCategorizing || !visibleMerchants.length}
                            onChange={() => onToggleUncategorizedGroup(group.merchant_key)}
                            aria-label={`Select ${group.merchant_key}`}
                          />
                        </label>
                        <div>
                          <strong><span className="dropdown-arrow" aria-hidden="true" />{group.merchant_key}</strong>
                          <span>{visibleMerchants.length} merchant{visibleMerchants.length === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                      <div className="category-actions" onClick={(event) => event.stopPropagation()}>
                        <select
                          disabled={isCategorizing || !visibleMerchants.length}
                          defaultValue=""
                          onChange={(event) => {
                            if (event.target.value) {
                              onApplyCategory(group.merchant_key, event.target.value, excludedMerchants);
                              event.target.value = '';
                            }
                          }}
                        >
                          <option value="">Assign category</option>
                          {allCategories.map((category) => (
                            <option value={category} key={`${group.merchant_key}-${category}`}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                    </summary>
                    <div className="merchant-chip-list">
                      {visibleMerchants.length ? (
                        visibleMerchants.map((merchant) => (
                          <div className="merchant-chip" key={`uncategorized-${group.merchant_key}-${merchant}`}>
                            <span>{merchant}</span>
                            <button
                              type="button"
                              onClick={() => onExcludeUncategorizedMerchant(group.merchant_key, merchant)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="empty-state">All merchants have been removed from this group.</p>
                      )}
                    </div>
                  </details>
                );
              })
            ) : (
              <p className="empty-state">No uncategorized spending merchants.</p>
            )}

            {uncategorizedTotal > uncategorizedPageSize ? (
              <div className="pagination-controls">
                <button
                  type="button"
                  disabled={isCategorizing || uncategorizedPage === 0}
                  onClick={() => onUncategorizedPageChange(uncategorizedPage - 1)}
                >
                  Previous
                </button>
                <span>Page {uncategorizedPage + 1}</span>
                <button
                  type="button"
                  disabled={isCategorizing || !categoryDetails.uncategorized_has_more}
                  onClick={() => onUncategorizedPageChange(uncategorizedPage + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </details>
  );
}
