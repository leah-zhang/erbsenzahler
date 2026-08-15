import { useMemo, useState } from 'react';

import { formatCurrency } from '../utils/currency';

const baseAccountValueColumns = [
  ['monthEnd', 'Month End', 'date'],
  ['projected', 'Projected', 'number'],
  ['date', 'Date', 'date'],
  ['actual', 'Actual', 'computed'],
  ['diff', 'Diff', 'computed'],
  ['cash', 'Cash', 'computed'],
  ['vsLastMonth', 'vs Last Month', 'computed'],
  ['notes', 'Notes', 'text'],
];

const initialAccountYears = [2026, 2025, 2024, 2023, 2022, 2021];
const defaultAccountColumnsByYear = {
  2026: [
    'CIBC- Cash',
    'RBC- Cash',
    'Simplii - Cash',
    'Wealthsimple Chequing',
    'Wealthsimple- RRSP + TFSA',
  ],
};

const importMappingRoles = [
  ['monthEnd', 'Month End'],
  ['projected', 'Projected'],
  ['actual', 'Actual'],
  ['diff', 'Diff'],
  ['date', 'Date'],
  ['notes', 'Notes'],
  ['contribution', 'Investment Contribution'],
  ['account', 'Account'],
];

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDiff(value) {
  if (!value) {
    return formatCurrency(0);
  }

  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
}

function formatMonthName(monthEnd) {
  if (!monthEnd) {
    return '';
  }

  const monthIndex = Number(monthEnd.slice(5, 7)) - 1;
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return monthNames[monthIndex] || monthEnd;
}

function cashTotal(row) {
  return Object.entries(row.accounts || {}).reduce((total, [accountName, value]) => (
    accountName.trim().endsWith('- Cash') ? total + numericValue(value) : total
  ), 0);
}

function investmentContributions(row) {
  return Object.values(row.contributions || {}).reduce((total, value) => total + numericValue(value), 0);
}

function uniqueColumnNames(names) {
  const normalizedNames = new Set();
  return names.filter((name) => {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName || normalizedNames.has(normalizedName)) {
      return false;
    }
    normalizedNames.add(normalizedName);
    return true;
  });
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 20h4.6L19.4 9.2l-4.6-4.6L4 15.4V20z" />
      <path d="M13.6 5.8l4.6 4.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function AccountValuesTab({
  importDraft,
  rows,
  onAddRow,
  onCancelImport,
  onConfirmImport,
  onDeleteRow,
  onImportYear,
  onImportRoleChange,
  onAddColumn,
  onDeleteColumn,
  onRenameColumn,
  onUpdateRow,
}) {
  const [editingRows, setEditingRows] = useState([]);
  const [editingColumnYears, setEditingColumnYears] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [addedYears, setAddedYears] = useState([]);
  const [hiddenColumns, setHiddenColumns] = useState([]);

  const accountYears = useMemo(() => {
    const rowYears = rows
      .map((row) => row.year || Number(row.monthEnd?.slice(0, 4)))
      .filter((year) => Number.isFinite(year));

    return Array.from(new Set([
      ...initialAccountYears,
      ...addedYears,
      ...rowYears,
    ])).sort((left, right) => right - left);
  }, [addedYears, rows]);

  const rowsByYear = useMemo(
    () => accountYears.reduce((groupedRows, year) => {
      groupedRows[year] = rows
        .filter((row) => (row.year || Number(row.monthEnd?.slice(0, 4)) || 2026) === year)
        .sort((left, right) => (left.monthEnd || '').localeCompare(right.monthEnd || ''));
      return groupedRows;
    }, {}),
    [accountYears, rows],
  );

  const getImportColumnRole = (columnIndex) => {
    if (!importDraft) {
      return '';
    }

    const columnValue = String(columnIndex);
    if ((importDraft.mapping.accounts || []).includes(columnValue)) {
      return 'account';
    }
    if ((importDraft.mapping.contributions || []).includes(columnValue)) {
      return 'contribution';
    }

    const mappedRole = Object.entries(importDraft.mapping)
      .find(([key, value]) => !['accounts', 'contributions'].includes(key) && value === columnValue);
    return mappedRole?.[0] || 'account';
  };

  const importColumnCount = importDraft
    ? importDraft.preview.reduce((count, row) => Math.max(count, row.length), 0)
    : 0;
  const importHeaders = importDraft?.preview[0] || [];
  const importRows = importDraft?.preview.slice(1) || [];
  const importPreviewStyle = {
    gridTemplateColumns: `repeat(${Math.max(importColumnCount, 1)}, minmax(150px, 1fr))`,
    minWidth: `${Math.max(importColumnCount, 1) * 150}px`,
  };

  const toggleRowEditing = (rowId) => {
    setEditingRows((current) => (
      current.includes(rowId)
        ? current.filter((editingRowId) => editingRowId !== rowId)
        : [...current, rowId]
    ));
  };

  const toggleColumnEditing = (year) => {
    setEditingColumnYears((current) => (
      current.includes(year)
        ? current.filter((editingYear) => editingYear !== year)
        : [...current, year]
    ));
  };

  const toggleYearSection = (year, section) => {
    setExpandedSections((current) => ({
      ...current,
      [year]: {
        ...current[year],
        [section]: !current[year]?.[section],
      },
    }));
  };

  const toggleNoteExpansion = (rowId) => {
    setExpandedNotes((current) => (
      current.includes(rowId)
        ? current.filter((expandedRowId) => expandedRowId !== rowId)
        : [...current, rowId]
    ));
  };

  const handleAddYear = () => {
    const nextYear = Math.max(...accountYears) + 1;
    setAddedYears((current) => (
      current.includes(nextYear) ? current : [nextYear, ...current]
    ));
  };

  const handleRemoveYear = (year) => {
    setAddedYears((current) => current.filter((addedYear) => addedYear !== year));
  };

  const handleAddColumn = (year, section) => {
    onAddColumn(year, section);
  };

  const handleColumnNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  const handleColumnNameBlur = (event, year, section, currentColumnName) => {
    const nextColumnName = event.target.value.trim();
    if (!nextColumnName) {
      event.target.value = currentColumnName;
      return;
    }

    onRenameColumn(year, section, currentColumnName, nextColumnName);
  };

  const handleDeleteColumn = (year, section, columnName) => {
    const confirmed = window.confirm(`Delete the "${columnName}" column? This will remove its values from every row in ${year}.`);
    if (!confirmed) {
      return;
    }

    setHiddenColumns((current) => [...current, `${year}:${section}:${columnName}`]);
    onDeleteColumn(year, section, columnName);
  };

  return (
    <section className="account-values-page">
      <article className="insight-panel">
        <div className="panel-heading account-values-heading">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>Account values</h2>
          </div>
          <button type="button" onClick={handleAddYear}>Add year</button>
        </div>

        {importDraft ? (
          <div className="account-import-mapping">
            <div className="panel-heading account-values-heading">
              <div>
                <p className="eyebrow">CSV mapping</p>
                <h3>Map {importDraft.file.name}</h3>
              </div>
              <div className="mapping-actions">
                <button type="button" onClick={onCancelImport}>Cancel</button>
                <button type="button" onClick={onConfirmImport}>Import mapped CSV</button>
              </div>
            </div>

            <div className="preview-table" aria-label="Account value CSV preview">
              <div className="preview-row mapping-row" style={importPreviewStyle}>
                {Array.from({ length: importColumnCount }, (_, index) => (
                  <label className="column-mapper" key={`account-mapper-${index}`}>
                    <span>{importHeaders[index] || `Column ${index + 1}`}</span>
                    <select value={getImportColumnRole(index)} onChange={(event) => onImportRoleChange(index, event.target.value)}>
                      <option value="">Not mapped</option>
                      {importMappingRoles.map(([field, label]) => (
                        <option value={field} key={`${index}-${field}`}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="preview-row preview-head" style={importPreviewStyle}>
                {Array.from({ length: importColumnCount }, (_, index) => (
                  <span key={`account-head-${index}`}>{importHeaders[index] || `Column ${index + 1}`}</span>
                ))}
              </div>
              {importRows.slice(0, 4).map((row, rowIndex) => (
                <div className="preview-row" style={importPreviewStyle} key={`account-row-${rowIndex}`}>
                  {Array.from({ length: importColumnCount }, (_, index) => (
                    <span key={`account-cell-${rowIndex}-${index}`}>{row[index] || '-'}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="account-year-list">
          {accountYears.map((year) => {
            const yearRows = rowsByYear[year] || [];
            const hiddenColumnSet = new Set(hiddenColumns.filter((columnKey) => columnKey.startsWith(`${year}:`)));
            const isEditingColumns = editingColumnYears.includes(year);
            const accountColumns = uniqueColumnNames([
              ...(defaultAccountColumnsByYear[year] || []),
              ...yearRows.flatMap((row) => Object.keys(row.accounts || {})),
            ]).filter((accountName) => !hiddenColumnSet.has(`${year}:accounts:${accountName}`));
            const contributionNames = uniqueColumnNames(
              yearRows.flatMap((row) => Object.keys(row.contributions || {})),
            ).filter((contributionName) => !hiddenColumnSet.has(`${year}:contributions:${contributionName}`));
            const hasContributions = contributionNames.length > 0;
            const showContributions = Boolean(expandedSections[year]?.contributions);
            const showAccounts = Boolean(expandedSections[year]?.accounts);
            const hasEditableColumns = (showContributions && contributionNames.length > 0)
              || (showAccounts && accountColumns.length > 0);
            const columns = [
              ...baseAccountValueColumns,
              ...(showContributions ? contributionNames.map((contributionName) => [`contribution:${contributionName}`, contributionName, 'number']) : []),
              ...(showAccounts ? accountColumns.map((accountName) => [`account:${accountName}`, accountName, 'number']) : []),
            ];
            const cashByMonthEnd = Object.fromEntries(yearRows.map((row) => [row.monthEnd, cashTotal(row)]));
            const contributionTotals = Object.fromEntries(contributionNames.map((contributionName) => [
              `contribution:${contributionName}`,
              yearRows.reduce((total, row) => total + numericValue(row.contributions?.[contributionName]), 0),
            ]));

            return (
              <details className="account-year-panel" key={year} open={year === 2026 || addedYears.includes(year)}>
                <summary>
                  <div>
                    <strong><span className="dropdown-arrow" aria-hidden="true" />{year}</strong>
                    <span>{yearRows.length} row{yearRows.length === 1 ? '' : 's'}</span>
                  </div>
                  <button type="button" onClick={(event) => {
                    event.preventDefault();
                    onAddRow(year);
                  }}>
                    Add row
                  </button>
                  {addedYears.includes(year) && !yearRows.length ? (
                    <button type="button" onClick={(event) => {
                      event.preventDefault();
                      handleRemoveYear(year);
                    }}>
                      Remove year
                    </button>
                  ) : null}
                  <label className="account-import-button" onClick={(event) => event.stopPropagation()}>
                    Import CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onImportYear(year, file);
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                </summary>

                <div className="account-table-toggles">
                  <div className="account-toggle-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={showContributions}
                        onChange={() => toggleYearSection(year, 'contributions')}
                      />
                      <span>{hasContributions ? 'Investment contributions' : 'No investment contributions'}</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showAccounts}
                        onChange={() => toggleYearSection(year, 'accounts')}
                      />
                      <span>Accounts breakdown</span>
                    </label>
                  </div>
                  <div className="account-column-actions">
                    {showContributions ? (
                      <button type="button" onClick={() => handleAddColumn(year, 'contributions')}>
                        Add contribution column
                      </button>
                    ) : null}
                    {showAccounts ? (
                      <button type="button" onClick={() => handleAddColumn(year, 'accounts')}>
                        Add account column
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="account-values-table-wrap">
                  <table className={`account-values-table${year === 2026 ? '' : ' compact-account-table'}`}>
                    <thead>
                      <tr>
                        {columns.map(([key, label]) => {
                          const isContributionColumn = key.startsWith('contribution:');
                          const isAccountColumn = key.startsWith('account:');
                          const columnSection = isContributionColumn ? 'contributions' : 'accounts';
                          const columnName = isContributionColumn
                            ? key.slice('contribution:'.length)
                            : isAccountColumn
                              ? key.slice('account:'.length)
                              : '';

                          return (
                          <th key={key}>
                            {['actual', 'diff', 'cash', 'vsLastMonth'].includes(key) ? (
                              <span
                                className="account-tooltip"
                                title={{
                                  actual: 'Actual is calculated as the sum of all account columns in this row.',
                                  diff: 'Diff is calculated as Actual minus Projected.',
                                  cash: 'Cash is calculated as the sum of account columns ending in - Cash.',
                                  vsLastMonth: 'vs Last Month is calculated as this month cash minus last month cash, plus TFSA, RRSP, and unregistered contributions.',
                                }[key]}
                              >
                                {label}
                              </span>
                            ) : isContributionColumn || isAccountColumn ? (
                              <span className="account-column-heading">
                                {isEditingColumns ? (
                                  <>
                                    <input
                                      key={`${year}:${columnSection}:${columnName}`}
                                      className="account-column-name-input"
                                      aria-label={`Rename ${isContributionColumn ? 'investment contribution' : 'account'} column`}
                                      defaultValue={columnName}
                                      onBlur={(event) => handleColumnNameBlur(event, year, columnSection, columnName)}
                                      onKeyDown={handleColumnNameKeyDown}
                                    />
                                    <button
                                      type="button"
                                      aria-label={`Delete ${columnName} column`}
                                      title="Delete column"
                                      onClick={() => handleDeleteColumn(year, columnSection, columnName)}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </>
                                ) : columnName}
                              </span>
                            ) : label}
                            {contributionTotals[key] !== undefined ? (
                              <small>{formatCurrency(contributionTotals[key])}</small>
                            ) : null}
                          </th>
                          );
                        })}
                        <th className="account-column-edit-actions" aria-label="Column actions">
                          {hasEditableColumns ? (
                            <button
                              type="button"
                              aria-label={isEditingColumns ? 'Done editing columns' : 'Edit columns'}
                              title={isEditingColumns ? 'Done' : 'Edit columns'}
                              onClick={() => toggleColumnEditing(year)}
                            >
                              {isEditingColumns ? <CheckIcon /> : <PencilIcon />}
                            </button>
                          ) : null}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearRows.map((row) => {
                        const isEditing = editingRows.includes(row.id);
                        const isNoteExpanded = expandedNotes.includes(row.id);

                        return (
                          <tr key={row.id}>
                            {columns.map(([key, label, type]) => {
                              const isAccountValue = key.startsWith('account:');
                              const isContributionValue = key.startsWith('contribution:');
                              const rawValue = isAccountValue
                                ? row.accounts?.[key.slice('account:'.length)]
                                : isContributionValue
                                  ? row.contributions?.[key.slice('contribution:'.length)]
                                : row[key];
                              const diff = numericValue(row.actual) - numericValue(row.projected);
                              const rowIndex = yearRows.findIndex((candidate) => candidate.id === row.id);
                              const previousRow = rowIndex > 0 ? yearRows[rowIndex - 1] : null;
                              const cash = cashTotal(row);
                              const previousCash = previousRow ? cashByMonthEnd[previousRow.monthEnd] || 0 : 0;
                              const vsLastMonth = rowIndex > 0 ? cash - previousCash + investmentContributions(row) : 0;
                              const value = key === 'diff'
                                ? formatDiff(diff)
                                : key === 'cash'
                                  ? formatCurrency(cash)
                                  : key === 'vsLastMonth'
                                    ? formatDiff(vsLastMonth)
                                : rawValue ?? '';
                              const displayValue = (() => {
                                if (key === 'monthEnd') {
                                  return formatMonthName(row.monthEnd);
                                }
                                if (key === 'actual') {
                                  return formatCurrency(row.actual);
                                }
                                if (key === 'diff') {
                                  return value;
                                }
                                if (key === 'cash' || key === 'vsLastMonth') {
                                  return value;
                                }
                                if (type === 'number') {
                                  return formatCurrency(value);
                                }
                                return value;
                              })();

                              return (
                                <td key={`${row.id}-${key}`} data-label={label}>
                                  {key === 'notes' && !isEditing ? (
                                    <span className={`account-note${isNoteExpanded ? ' expanded' : ''}`}>
                                      <span>{displayValue || '-'}</span>
                                      {String(displayValue || '').length > 36 ? (
                                        <button type="button" onClick={() => toggleNoteExpansion(row.id)}>
                                          {isNoteExpanded ? 'Less' : 'More'}
                                        </button>
                                      ) : null}
                                    </span>
                                  ) : type === 'computed' || !isEditing ? (
                                    <strong className={(key === 'diff' && diff !== 0) || (key === 'vsLastMonth' && vsLastMonth !== 0) ? ((key === 'diff' ? diff : vsLastMonth) > 0 ? 'positive-diff' : 'negative-diff') : ''}>
                                      {displayValue}
                                    </strong>
                                  ) : (
                                    <input
                                      type={type}
                                      step={type === 'number' ? '0.01' : undefined}
                                      value={value}
                                      onChange={(event) => onUpdateRow(row.id, key, event.target.value)}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td className="account-row-actions">
                              <button
                                type="button"
                                aria-label={isEditing ? 'Done editing row' : 'Edit row'}
                                title={isEditing ? 'Done' : 'Edit'}
                                onClick={() => toggleRowEditing(row.id)}
                              >
                                {isEditing ? <CheckIcon /> : <PencilIcon />}
                              </button>
                              <button
                                type="button"
                                aria-label="Delete row"
                                title="Delete"
                                onClick={() => onDeleteRow(row.id)}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!yearRows.length ? (
                  <p className="empty-state">No account values recorded for {year} yet.</p>
                ) : null}
              </details>
            );
          })}
        </div>

        {!rows.length ? (
          <p className="empty-state">Add a row to start tracking month-end account values.</p>
        ) : null}
      </article>
    </section>
  );
}
