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

const accountYears = [2026, 2025, 2024, 2023, 2022, 2021];
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

export function AccountValuesTab({
  importDraft,
  rows,
  onAddRow,
  onCancelImport,
  onConfirmImport,
  onDeleteRow,
  onImportYear,
  onImportRoleChange,
  onUpdateRow,
}) {
  const [editingRows, setEditingRows] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedNotes, setExpandedNotes] = useState([]);

  const rowsByYear = useMemo(
    () => accountYears.reduce((groupedRows, year) => {
      groupedRows[year] = rows
        .filter((row) => (row.year || Number(row.monthEnd?.slice(0, 4)) || 2026) === year)
        .sort((left, right) => (left.monthEnd || '').localeCompare(right.monthEnd || ''));
      return groupedRows;
    }, {}),
    [rows],
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

  return (
    <section className="account-values-page">
      <article className="insight-panel">
        <div className="panel-heading account-values-heading">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>Account values</h2>
          </div>
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
            const accountColumns = Array.from(new Set([
              ...(defaultAccountColumnsByYear[year] || []),
              ...yearRows.flatMap((row) => Object.keys(row.accounts || {})),
            ]));
            const contributionNames = Array.from(new Set(
              yearRows.flatMap((row) => Object.keys(row.contributions || {})),
            ));
            const hasContributions = contributionNames.length > 0;
            const showContributions = Boolean(expandedSections[year]?.contributions);
            const showAccounts = Boolean(expandedSections[year]?.accounts);
            const columns = [
              ...baseAccountValueColumns,
              ...(showContributions ? contributionNames.map((contributionName) => [`contribution:${contributionName}`, `${contributionName} Contribution`, 'number']) : []),
              ...(showAccounts ? accountColumns.map((accountName) => [`account:${accountName}`, accountName, 'number']) : []),
            ];
            const cashByMonthEnd = Object.fromEntries(yearRows.map((row) => [row.monthEnd, cashTotal(row)]));
            const contributionTotals = Object.fromEntries(contributionNames.map((contributionName) => [
              `contribution:${contributionName}`,
              yearRows.reduce((total, row) => total + numericValue(row.contributions?.[contributionName]), 0),
            ]));

            return (
              <details className="account-year-panel" key={year} open={year === 2026}>
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
                  <label>
                    <input
                      type="checkbox"
                      checked={showContributions && hasContributions}
                      disabled={!hasContributions}
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

                <div className="account-values-table-wrap">
                  <table className={`account-values-table${year === 2026 ? '' : ' compact-account-table'}`}>
                    <thead>
                      <tr>
                        {columns.map(([key, label]) => (
                          <th key={label}>
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
                            ) : label}
                            {contributionTotals[key] !== undefined ? (
                              <small>{formatCurrency(contributionTotals[key])}</small>
                            ) : null}
                          </th>
                        ))}
                        <th aria-label="Actions" />
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
                              <button type="button" onClick={() => toggleRowEditing(row.id)}>
                                {isEditing ? 'Done' : 'Edit'}
                              </button>
                              <button type="button" onClick={() => onDeleteRow(row.id)}>Delete</button>
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
