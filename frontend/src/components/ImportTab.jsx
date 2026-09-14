import { CategorizationPanel } from './CategorizationPanel';

const mappingRoles = [
  ['date', 'Date'],
  ['description', 'Description'],
  ['amount', 'Amount'],
  ['account', 'Account'],
];

export function ImportTab({
  amountSign,
  columnMapping,
  columnOptions,
  categoryOptions,
  customCategories,
  csvPreview,
  categorizationHasMore,
  categorizationGroups,
  categorizationPage,
  categorizationPageSize,
  categorizationTotal,
  duplicateImportBatch,
  duplicateRowsToKeep,
  hasHeader,
  isCategorizing,
  isClearingCategories,
  isClearingTransactions,
  isUploading,
  onApplyCategory,
  onCategorizationPageChange,
  onClearCategories,
  onClearTransactions,
  onCustomCategoryChange,
  onFileChange,
  onAmountSignChange,
  onHeaderChange,
  onResolveDuplicateRows,
  onToggleDuplicateRow,
  onUpdateColumnRole,
  onUpload,
  previewGridStyle,
  previewRows,
  selectedFile,
  status,
}) {
  const getColumnRole = (columnIndex) => {
    const mappedRole = Object.entries(columnMapping).find(([, value]) => value === String(columnIndex));
    return mappedRole?.[0] || '';
  };

  return (
    <section className="workspace-grid">
      <div className="control-panel">
        <div className="panel-heading">
          <p className="eyebrow">Statement intake</p>
          <h2>Upload a file</h2>
        </div>

        <label className="file-drop">
          <input
            type="file"
            accept=".csv"
            onChange={(event) => onFileChange(event.target.files[0] || null)}
          />
          <span>{selectedFile ? selectedFile.name : 'Choose a CSV statement'}</span>
          <small>{selectedFile ? `${Math.ceil(selectedFile.size / 1024)} KB ready` : 'Headered and headerless CSVs are supported.'}</small>
        </label>

        {csvPreview.length ? (
          <div className="mapping-panel">
            <label className="toggle-row">
              <input type="checkbox" checked={hasHeader} onChange={(event) => onHeaderChange(event.target.checked)} />
              <span>First row contains column names</span>
            </label>

            <div className="amount-sign-panel">
              <span>In this CSV, spending amounts are</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={amountSign === 'spend_positive' ? 'active' : ''}
                  onClick={() => onAmountSignChange('spend_positive')}
                >
                  Positive
                </button>
                <button
                  type="button"
                  className={amountSign === 'spend_negative' ? 'active' : ''}
                  onClick={() => onAmountSignChange('spend_negative')}
                >
                  Negative
                </button>
              </div>
            </div>

            <div className="preview-table" aria-label="CSV preview">
              <div className="preview-row mapping-row" style={previewGridStyle}>
                {columnOptions.map((option, index) => (
                  <label className="column-mapper" key={`mapper-${option.value}`}>
                    <span>{option.label}</span>
                    <select value={getColumnRole(index)} onChange={(event) => onUpdateColumnRole(index, event.target.value)}>
                      <option value="">Not mapped</option>
                      {mappingRoles.map(([field, label]) => (
                        <option value={field} key={`${option.value}-${field}`}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {(hasHeader ? csvPreview.slice(0, 1) : []).map((row, rowIndex) => (
                <div className="preview-row preview-head" style={previewGridStyle} key={`head-${rowIndex}`}>
                  {columnOptions.map((option, index) => (
                    <span key={option.value}>{row[index] || `Column ${index + 1}`}</span>
                  ))}
                </div>
              ))}
              {previewRows.slice(0, 4).map((row, rowIndex) => (
                <div className="preview-row" style={previewGridStyle} key={`row-${rowIndex}`}>
                  {columnOptions.map((option, index) => (
                    <span key={option.value}>{row[index] || '-'}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <button className="primary-button" type="button" onClick={onUpload} disabled={isUploading}>
          {isUploading ? 'Importing...' : 'Import statement'}
        </button>

        {duplicateImportBatch?.rows?.length ? (
          <div className="duplicate-review-panel">
            <div className="panel-heading">
              <p className="eyebrow">Duplicate review</p>
              <h2>Possible duplicate rows</h2>
              <small>Checked rows will be kept. Unchecked rows will be discarded.</small>
            </div>
            <div className="duplicate-row-list">
              {duplicateImportBatch.rows.map((row) => (
                <label className="duplicate-row" key={row.id}>
                  <input
                    type="checkbox"
                    checked={duplicateRowsToKeep.includes(row.id)}
                    onChange={() => onToggleDuplicateRow(row.id)}
                  />
                  <span>{row.date}</span>
                  <strong>{row.description}</strong>
                  <span>{row.account}</span>
                  <span>{Number(row.amount || 0).toFixed(2)}</span>
                </label>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={onResolveDuplicateRows} disabled={isUploading}>
              Resolve duplicate rows
            </button>
          </div>
        ) : null}

        <CategorizationPanel
          categoryOptions={categoryOptions}
          customCategories={customCategories}
          hasMore={categorizationHasMore}
          groups={categorizationGroups}
          isCategorizing={isCategorizing}
          onApplyCategory={onApplyCategory}
          onPageChange={onCategorizationPageChange}
          onCustomCategoryChange={onCustomCategoryChange}
          page={categorizationPage}
          pageSize={categorizationPageSize}
          total={categorizationTotal}
        />
      </div>

      <div className="status-panel">
        <p className="eyebrow">Status</p>
        <p>{status}</p>
        <div className="maintenance-actions">
          <button className="danger-button" type="button" onClick={onClearTransactions} disabled={isClearingTransactions}>
            {isClearingTransactions ? 'Clearing...' : 'Clear transactions'}
          </button>
          <button className="danger-button secondary-danger" type="button" onClick={onClearCategories} disabled={isClearingCategories}>
            {isClearingCategories ? 'Clearing...' : 'Clear categories'}
          </button>
        </div>
      </div>
    </section>
  );
}
