import { CategorizationPanel } from './CategorizationPanel';

const mappingRoles = [
  ['date', 'Date'],
  ['description', 'Description'],
  ['amount', 'Amount'],
  ['debit', 'Debit'],
  ['credit', 'Credit'],
  ['category', 'Category'],
  ['account', 'Account'],
];

export function ImportTab({
  automationJobId,
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
  hasHeader,
  isAutomating,
  isCategorizing,
  isClearingCategories,
  isClearingTransactions,
  isUploading,
  onAutomation,
  onAutomationContinue,
  onApplyCategory,
  onCategorizationPageChange,
  onClearCategories,
  onClearTransactions,
  onCustomCategoryChange,
  onFileChange,
  onHeaderChange,
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

      <div className="control-panel accent-panel">
        <div className="panel-heading">
          <p className="eyebrow">Browser automation</p>
          <h2>Assisted download</h2>
        </div>
        <p>
          Opens the bank site in your browser while keeping login manual and local.
        </p>
        <button className="secondary-button" type="button" onClick={onAutomation} disabled={isAutomating}>
          {isAutomating ? 'Starting...' : 'Start download flow'}
        </button>
        <button className="secondary-button" type="button" onClick={onAutomationContinue} disabled={isAutomating || !automationJobId}>
          Continue after login
        </button>
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
