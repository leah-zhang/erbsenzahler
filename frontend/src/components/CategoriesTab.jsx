import { CategorizationPanel } from './CategorizationPanel';
import { ActionFeedback } from './ActionFeedback';
import { DataState } from './DataState';

export function CategoriesTab({
  categories,
  categorizationProps,
  categoryEdits,
  isRenamingCategory,
  onCategoryEditChange,
  onRemoveCategorizedMerchant,
  onRenameCategory,
  feedback,
  onDismissFeedback,
  loadState,
  onRetry,
}) {
  const detailsByName = Object.fromEntries(
    (categorizationProps.categoryDetails.categories || []).map((category) => [category.name, category]),
  );

  if (loadState?.loading || loadState?.error) {
    return <DataState state={loadState} label="categories" onRetry={onRetry} />;
  }

  return (
    <section className="categories-page">
      <div className="tab-feedback">
        <ActionFeedback feedback={feedback} onDismiss={onDismissFeedback} />
      </div>
      <article className="insight-panel">
        <div className="panel-heading">
          <p className="eyebrow">Categories</p>
          <h2>Manage categories</h2>
          <small>Edit category names, review mapped merchants, and assign uncategorized merchant groups.</small>
        </div>

        {categories.length ? (
          <div className="category-list">
            {categories.map((category) => {
              const editedName = categoryEdits[category.name] ?? category.name;
              const isChanged = editedName.trim() && editedName.trim() !== category.name;
              const categoryDetail = detailsByName[category.name];
              const merchantGroups = categoryDetail?.merchant_groups || [];

              return (
                <details className="category-dropdown" key={category.name}>
                  <summary className="category-row">
                    <div>
                      <strong><span className="dropdown-arrow" aria-hidden="true" />{category.name}</strong>
                      <span>{category.transaction_count} transaction{category.transaction_count === 1 ? '' : 's'}</span>
                    </div>
                    <div className="category-edit" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="text"
                        value={editedName}
                        disabled={isRenamingCategory}
                        onChange={(event) => onCategoryEditChange(category.name, event.target.value)}
                      />
                      <button
                        type="button"
                        disabled={isRenamingCategory || !isChanged}
                        onClick={() => onRenameCategory(category.name, editedName)}
                      >
                        Save
                      </button>
                    </div>
                  </summary>

                  <div className="category-dropdown-body">
                    {merchantGroups.length ? (
                      merchantGroups.map((group) => (
                        <details className="merchant-group-dropdown" key={`${category.name}-${group.merchant_key}`}>
                          <summary>
                            <div>
                              <strong><span className="dropdown-arrow" aria-hidden="true" />{group.merchant_key}</strong>
                              <span>{group.count} transaction{group.count === 1 ? '' : 's'}</span>
                            </div>
                          </summary>
                          <div className="merchant-chip-list">
                            {group.merchants.map((merchant) => (
                              <div className="merchant-chip" key={`${category.name}-${group.merchant_key}-${merchant}`}>
                                <span>{merchant}</span>
                                <button
                                  type="button"
                                  onClick={() => onRemoveCategorizedMerchant(category.name, merchant)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))
                    ) : (
                      <p className="empty-state">No mapped spending merchants in this category.</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No categories yet. Categorize imported merchants to build this list.</p>
        )}

        <CategorizationPanel {...categorizationProps} />
      </article>
    </section>
  );
}
