import { CategorizationPanel } from './CategorizationPanel';
import { ActionFeedback } from './ActionFeedback';
import { DataState } from './DataState';

const mappingRoles = [
  ['date', 'Date'],
  ['description', 'Description'],
  ['amount', 'Amount'],
  ['account', 'Account'],
];

export function ImportTab({
  amountSign,
  columnMapping,
  categorizationProps,
  showCategorization,
  categoryLoadState,
  onRetryCategories,
  columnOptions,
  csvPreview,
  duplicateImportBatch,
  duplicateRowsToKeep,
  hasHeader,
  isClearingCategories,
  isClearingTransactions,
  isUploading,
  importRowError,
  onImportRowChange,
  onResolveImportRow,
  onClearCategories,
  onClearTransactions,
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
  feedback,
  recentImports,
  onRetryRecentImports,
  recentImportsLoadState,
  importProfiles,
  selectedProfileId,
  profileName,
  onProfileNameChange,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  defaultAccount,
  onDefaultAccountChange,
  importAccounts,
}) {
  const selectedProfile = importProfiles.find((profile) => profile.id === selectedProfileId);
  const profileShapeChanged = selectedFile && selectedProfile && (
    (selectedProfile.columnCount && selectedProfile.columnCount !== columnOptions.length)
    || (hasHeader && selectedProfile.columnHeaders?.length && JSON.stringify(selectedProfile.columnHeaders) !== JSON.stringify(csvPreview[0]))
  );
  const getColumnRole = (columnIndex) => {
    const mappedRole = Object.entries(columnMapping).find(([, value]) => value === String(columnIndex));
    return mappedRole?.[0] || '';
  };

  return (
    <section className="workspace-grid import-workspace">
      <div className="control-panel">
        <div className="panel-heading">
          <p className="eyebrow">Statement intake</p>
          <h2>Upload a file</h2>
        </div>

        <div className="import-setup">
          <label className="column-mapper">
            <span>Saved import setup</span>
            <select value={selectedProfileId} disabled={isUploading} onChange={(event) => onSelectProfile(event.target.value)}>
              <option value="">New setup</option>
              {importProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <small>Reuse mapping, headers, spending sign, and account. Saved in this browser.</small>
        </div>

        <label className="file-drop">
          <input
            type="file"
            accept=".csv"
            disabled={isUploading}
            onChange={(event) => onFileChange(event.target.files[0] || null)}
          />
          <span>{selectedFile ? selectedFile.name : 'Choose a CSV statement'}</span>
          <small>{selectedFile ? `${Math.ceil(selectedFile.size / 1024)} KB ready` : 'Headered and headerless CSVs are supported.'}</small>
        </label>

        {csvPreview.length ? (
          <div className="mapping-panel">
            {profileShapeChanged ? <p role="status">This file has different columns from your saved setup. Review the mapping before importing.</p> : null}
            <label className="toggle-row">
              <input type="checkbox" disabled={isUploading} checked={hasHeader} onChange={(event) => onHeaderChange(event.target.checked)} />
              <span>First row contains column names</span>
            </label>

            <div className="amount-sign-panel">
              <span>In this CSV, spending amounts are</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={amountSign === 'spend_positive' ? 'active' : ''}
                  disabled={isUploading}
                  onClick={() => onAmountSignChange('spend_positive')}
                >
                  Positive
                </button>
                <button
                  type="button"
                  className={amountSign === 'spend_negative' ? 'active' : ''}
                  disabled={isUploading}
                  onClick={() => onAmountSignChange('spend_negative')}
                >
                  Negative
                </button>
              </div>
            </div>

            <label className="column-mapper">
              <span>Account for rows without an account</span>
              <input type="text" list="import-account-names" value={defaultAccount} placeholder="e.g. CIBC Visa" disabled={isUploading} onChange={(event) => onDefaultAccountChange(event.target.value)} />
              <small>Values in a mapped account column take precedence. If left blank, missing accounts use “bank”.</small>
            </label>
            <datalist id="import-account-names">{Array.from(new Set([...importAccounts, ...importProfiles.map((profile) => profile.defaultAccount)])).filter(Boolean).map((name) => <option value={name} key={name} />)}</datalist>

            <div className="preview-table" aria-label="CSV preview">
              <div className="preview-row mapping-row" style={previewGridStyle}>
                {columnOptions.map((option, index) => (
                  <label className="column-mapper" key={`mapper-${option.value}`}>
                    <span>{option.label}</span>
                    <select disabled={isUploading} value={getColumnRole(index)} onChange={(event) => onUpdateColumnRole(index, event.target.value)}>
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
            <div className="import-setup-save">
              <label className="column-mapper"><span>Setup name</span><input type="text" value={profileName} placeholder="e.g. CIBC Visa" disabled={isUploading} onChange={(event) => onProfileNameChange(event.target.value)} /></label>
              <button type="button" disabled={isUploading || !profileName.trim()} onClick={onSaveProfile}>Save setup</button>
              {selectedProfileId ? <button type="button" disabled={isUploading} onClick={onDeleteProfile}>Remove saved setup</button> : null}
            </div>
          </div>
        ) : null}

        {selectedFile ? (
          <button className="primary-button" type="button" onClick={onUpload} disabled={isUploading}>
            {isUploading ? 'Importing...' : 'Import statement'}
          </button>
        ) : null}

        {importRowError ? (
          <div className="mapping-panel" role="region" aria-label="CSV row editor">
            <div className="panel-heading">
              <h2>Edit row {importRowError.row_number}</h2>
              <p role="alert">{importRowError.message}</p>
              <small>Correct the values below or delete this row from the import.</small>
            </div>
            {importRowError.row.map((cell, index) => (
              <label className="column-mapper" key={index}>
                <span>{columnOptions[index]?.label || `Column ${index + 1}`}</span>
                <input
                  type="text"
                  value={cell}
                  disabled={isUploading}
                  onChange={(event) => onImportRowChange(index, event.target.value)}
                />
              </label>
            ))}
            <div className="category-actions">
              <button type="button" disabled={isUploading} onClick={() => onResolveImportRow(false)}>
                Save row and retry import
              </button>
              <button className="danger-button" type="button" disabled={isUploading} onClick={() => onResolveImportRow(true)}>
                Delete row and retry import
              </button>
            </div>
          </div>
        ) : null}

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

        {showCategorization ? (
          categoryLoadState.loading || categoryLoadState.error
            ? <DataState state={categoryLoadState} label="merchant categories" onRetry={onRetryCategories} />
            : <CategorizationPanel {...categorizationProps} />
        ) : null}
      </div>

      <div className="import-sidebar">
        <section className="status-panel" aria-label="Import status">
          <ActionFeedback feedback={feedback} />
        </section>
        <aside className="insight-panel recent-imports-panel" aria-label="Recently imported files">
          <div className="panel-heading">
            <p className="eyebrow">Import history</p>
            <h2>Recently imported files</h2>
            <small>Latest 10 imports, newest first.</small>
          </div>
          {recentImportsLoadState?.loading || recentImportsLoadState?.error ? (
            <DataState state={recentImportsLoadState} label="recent imports" onRetry={onRetryRecentImports} />
          ) : recentImports.length ? (
            <ul className="recent-imports-list">
              {recentImports.map((statement) => (
                <li key={statement.id}>
                  <strong title={statement.filename}>{statement.filename}</strong>
                  <time dateTime={statement.uploaded_at}>
                    {new Date(statement.uploaded_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          ) : <p className="empty-state">No files imported yet.</p>}
        </aside>
      </div>

      <section className="insight-panel import-danger-panel" aria-label="Reset Data">
        <h2>Reset Data</h2>
        <div className="maintenance-actions">
          <button className="danger-button" type="button" onClick={onClearTransactions} disabled={isClearingTransactions}>
            {isClearingTransactions ? 'Clearing...' : 'Clear transactions'}
          </button>
          <button className="danger-button secondary-danger" type="button" onClick={onClearCategories} disabled={isClearingCategories}>
            {isClearingCategories ? 'Clearing...' : 'Clear categories'}
          </button>
        </div>
      </section>
    </section>
  );
}
