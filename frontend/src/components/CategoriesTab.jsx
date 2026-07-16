export function CategoriesTab({
  categories,
  categoryEdits,
  isRenamingCategory,
  onCategoryEditChange,
  onRenameCategory,
}) {
  return (
    <section className="categories-page">
      <article className="insight-panel">
        <div className="panel-heading">
          <p className="eyebrow">Categories</p>
          <h2>Manage categories</h2>
          <small>Edit a category name to update all matching transactions.</small>
        </div>

        {categories.length ? (
          <div className="category-list">
            {categories.map((category) => {
              const editedName = categoryEdits[category.name] ?? category.name;
              const isChanged = editedName.trim() && editedName.trim() !== category.name;

              return (
                <div className="category-row" key={category.name}>
                  <div>
                    <strong>{category.name}</strong>
                    <span>{category.transaction_count} transaction{category.transaction_count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="category-edit">
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
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No categories yet. Categorize imported merchants to build this list.</p>
        )}
      </article>
    </section>
  );
}
