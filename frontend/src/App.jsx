import { useEffect, useMemo, useState } from 'react';

import { api } from './api/client';
import { AccountValuesTab } from './components/AccountValuesTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { CategoriesTab } from './components/CategoriesTab';
import { ImportTab } from './components/ImportTab';
import { TabBar } from './components/TabBar';
import { parseCsvPreview } from './utils/csvPreview';

const emptyColumnMapping = {
  date: '',
  description: '',
  amount: '',
  debit: '',
  credit: '',
  category: '',
  account: '',
};

const emptyAccountImportMapping = {
  monthEnd: '',
  projected: '',
  actual: '',
  diff: '',
  date: '',
  notes: '',
  accounts: [],
  contributions: [],
};

const categorizationPageSize = 10;
const uncategorizedCategoryPageSize = 20;
const batchCategoryKey = '__batch_uncategorized__';

function App() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [status, setStatus] = useState('Ready to load statements');
  const [analyticsTimeframeDays, setAnalyticsTimeframeDays] = useState(90);
  const [analyticsCategory, setAnalyticsCategory] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [isClearingTransactions, setIsClearingTransactions] = useState(false);
  const [isClearingCategories, setIsClearingCategories] = useState(false);
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationProfiles, setAutomationProfiles] = useState([]);
  const [automationAccountStatuses, setAutomationAccountStatuses] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [duplicateImportBatch, setDuplicateImportBatch] = useState(null);
  const [duplicateRowsToKeep, setDuplicateRowsToKeep] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [amountSign, setAmountSign] = useState('spend_positive');
  const [columnMapping, setColumnMapping] = useState(emptyColumnMapping);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categorySummary, setCategorySummary] = useState([]);
  const [categoryDetails, setCategoryDetails] = useState({
    categories: [],
    uncategorized_groups: [],
    uncategorized_total: 0,
    uncategorized_has_more: false,
  });
  const [uncategorizedCategoryPage, setUncategorizedCategoryPage] = useState(0);
  const [categoryEdits, setCategoryEdits] = useState({});
  const [categoryGroupExclusions, setCategoryGroupExclusions] = useState({});
  const [selectedUncategorizedGroups, setSelectedUncategorizedGroups] = useState([]);
  const [categorizationGroups, setCategorizationGroups] = useState([]);
  const [categorizationPage, setCategorizationPage] = useState(0);
  const [categorizationTotal, setCategorizationTotal] = useState(0);
  const [categorizationHasMore, setCategorizationHasMore] = useState(false);
  const [customCategories, setCustomCategories] = useState({});
  const [accountValueRows, setAccountValueRows] = useState([]);
  const [accountImportDraft, setAccountImportDraft] = useState(null);

  const loadSummary = async () => {
    try {
      const response = await api.get('/analytics/monthly', {
        params: {
          weekly_days: analyticsTimeframeDays,
          weekly_category: analyticsCategory,
        },
      });
      setSummary(response.data);
    } catch (error) {
      setSummary(null);
    }
  };

  useEffect(() => {
    loadCategoryDashboard();
    loadAccountValues();
    loadAutomationProfiles();
  }, []);

  useEffect(() => {
    loadSummary();
  }, [analyticsTimeframeDays, analyticsCategory]);

  const normalizeAccountSnapshot = (snapshot) => ({
    id: snapshot.id,
    year: snapshot.year,
    monthEnd: snapshot.month_end,
    projected: String(snapshot.projected ?? 0),
    notes: snapshot.notes || '',
    actual: snapshot.actual ?? 0,
    date: snapshot.recorded_date || '',
    accounts: Object.fromEntries((snapshot.accounts || []).map((account) => [
      account.account_name,
      String(account.value ?? 0),
    ])),
    contributions: Object.fromEntries((snapshot.contributions || []).map((contribution) => [
      contribution.account_name,
      String(contribution.value ?? 0),
    ])),
  });

  const accountRowPayload = (row) => ({
    year: row.year,
    month_end: row.monthEnd,
    projected: Number(row.projected || 0),
    recorded_date: row.date || '',
    notes: row.notes || '',
    accounts: Object.entries(row.accounts || {}).map(([accountName, value], index) => ({
      account_name: accountName,
      value: Number(value || 0),
      display_order: index,
    })),
    contributions: Object.entries(row.contributions || {}).map(([accountName, value], index) => ({
      account_name: accountName,
      value: Number(value || 0),
      display_order: index,
    })),
  });

  const loadAccountValues = async () => {
    try {
      const response = await api.get('/account-values');
      setAccountValueRows((response.data.snapshots || []).map(normalizeAccountSnapshot));
    } catch (error) {
      setAccountValueRows([]);
    }
  };

  const loadAutomationProfiles = async () => {
    try {
      const response = await api.get('/statements/download/profiles');
      const banks = response.data.banks || [];
      setAutomationProfiles(banks);
    } catch (error) {
      setAutomationProfiles([]);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await api.get('/transactions/categories');
      setCategoryOptions(response.data.categories || []);
    } catch (error) {
      setCategoryOptions([]);
    }
  };

  const loadCategorySummary = async () => {
    try {
      const response = await api.get('/transactions/category-summary');
      setCategorySummary(response.data.categories || []);
      setCategoryEdits(
        Object.fromEntries((response.data.categories || []).map((category) => [category.name, category.name])),
      );
    } catch (error) {
      setCategorySummary([]);
      setCategoryEdits({});
    }
  };

  const loadCategoryDetails = async (page = uncategorizedCategoryPage) => {
    try {
      const offset = page * uncategorizedCategoryPageSize;
      const response = await api.get('/transactions/category-details', {
        params: {
          uncategorized_limit: uncategorizedCategoryPageSize,
          uncategorized_offset: offset,
        },
      });
      setCategoryDetails({
        categories: response.data.categories || [],
        uncategorized_groups: response.data.uncategorized_groups || [],
        uncategorized_total: response.data.uncategorized_total || 0,
        uncategorized_has_more: Boolean(response.data.uncategorized_has_more),
      });
      setUncategorizedCategoryPage(page);
      setCategoryGroupExclusions({});
    } catch (error) {
      setCategoryDetails({
        categories: [],
        uncategorized_groups: [],
        uncategorized_total: 0,
        uncategorized_has_more: false,
      });
      setUncategorizedCategoryPage(0);
      setCategoryGroupExclusions({});
    }
  };

  const loadCategoryDashboard = async (page = uncategorizedCategoryPage) => {
    try {
      const offset = page * uncategorizedCategoryPageSize;
      const response = await api.get('/transactions/category-dashboard', {
        params: {
          uncategorized_limit: uncategorizedCategoryPageSize,
          uncategorized_offset: offset,
        },
      });
      setCategoryOptions(response.data.categories || []);
      setCategorySummary(response.data.category_summary || []);
      setCategoryEdits(
        Object.fromEntries((response.data.category_summary || []).map((category) => [category.name, category.name])),
      );
      setCategoryDetails({
        categories: response.data.category_details || [],
        uncategorized_groups: response.data.uncategorized_groups || [],
        uncategorized_total: response.data.uncategorized_total || 0,
        uncategorized_has_more: Boolean(response.data.uncategorized_has_more),
      });
      setUncategorizedCategoryPage(page);
      setCategoryGroupExclusions({});
    } catch (error) {
      setCategoryOptions([]);
      setCategorySummary([]);
      setCategoryEdits({});
      setCategoryDetails({
        categories: [],
        uncategorized_groups: [],
        uncategorized_total: 0,
        uncategorized_has_more: false,
      });
      setUncategorizedCategoryPage(0);
      setCategoryGroupExclusions({});
    }
  };

  const loadCategorizationSuggestions = async (page = categorizationPage) => {
    try {
      const response = await api.get('/transactions/categorization-suggestions', {
        params: {
          limit: categorizationPageSize,
          offset: page * categorizationPageSize,
        },
      });
      setCategorizationGroups(response.data.groups || []);
      setCategorizationPage(page);
      setCategorizationTotal(response.data.total || 0);
      setCategorizationHasMore(Boolean(response.data.has_more));
    } catch (error) {
      setCategorizationGroups([]);
      setCategorizationTotal(0);
      setCategorizationHasMore(false);
    }
  };

  const columnOptions = useMemo(() => {
    const columnCount = csvPreview.reduce((count, row) => Math.max(count, row.length), 0);
    const headerRow = hasHeader ? csvPreview[0] || [] : [];

    return Array.from({ length: columnCount }, (_, index) => ({
      value: String(index),
      label: headerRow[index] ? `${index + 1}: ${headerRow[index]}` : `Column ${index + 1}`,
    }));
  }, [csvPreview, hasHeader]);

  const previewRows = hasHeader ? csvPreview.slice(1) : csvPreview;
  const previewGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(columnOptions.length, 1)}, minmax(170px, 1fr))`,
    minWidth: `${Math.max(columnOptions.length, 1) * 170}px`,
  };

  const handleFileChange = async (file) => {
    setSelectedFile(file);
    setCsvPreview([]);
    setAmountSign('spend_positive');
    setColumnMapping(emptyColumnMapping);
    setCategorizationGroups([]);
    setCategorizationPage(0);
    setCategorizationTotal(0);
    setCategorizationHasMore(false);
    setCustomCategories({});
    setSelectedUncategorizedGroups([]);
    setDuplicateImportBatch(null);
    setDuplicateRowsToKeep([]);

    if (!file) {
      return;
    }

    const text = await file.text();
    const rows = parseCsvPreview(text);
    setCsvPreview(rows);
    setStatus(rows.length ? 'Map the CSV columns, then import.' : 'Could not read any rows from this CSV.');
  };

  const updateColumnRole = (columnIndex, field) => {
    setColumnMapping((current) => {
      const nextMapping = Object.fromEntries(
        Object.entries(current).map(([key, value]) => [key, value === String(columnIndex) ? '' : value]),
      );

      if (field) {
        nextMapping[field] = String(columnIndex);
      }

      return nextMapping;
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus('Please choose a statement file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('has_header', String(hasHeader));
    formData.append('amount_sign', amountSign);
    formData.append(
      'column_mapping',
      JSON.stringify(
        Object.fromEntries(
          Object.entries(columnMapping)
            .filter(([, value]) => value !== '')
            .map(([key, value]) => [key, Number(value)]),
        ),
      ),
    );
    setIsUploading(true);
    setStatus(`Uploading ${selectedFile.name}...`);

    try {
      const response = await api.post('/statements/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const duplicateCount = response.data.summary.duplicate_rows || 0;
      const importedCount = response.data.summary.imported ?? response.data.summary.rows;
      setStatus(
        duplicateCount
          ? `Imported ${importedCount} transactions from ${response.data.filename}. Review ${duplicateCount} possible duplicates.`
          : `Imported ${importedCount} transactions from ${response.data.filename}.`,
      );
      if (duplicateCount) {
        setDuplicateImportBatch({
          id: response.data.duplicate_batch_id,
          rows: response.data.duplicates || [],
        });
        setDuplicateRowsToKeep([]);
      } else {
        setDuplicateImportBatch(null);
        setDuplicateRowsToKeep([]);
      }
      setSelectedFile(null);
      setCsvPreview([]);
      setCustomCategories({});
      await Promise.all([
        loadCategorizationSuggestions(0),
        loadCategoryDashboard(0),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Upload failed. Make sure the backend is running and the CSV has Date, Description, and Amount columns.';
      setStatus(detail);
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleDuplicateRow = (rowId) => {
    setDuplicateRowsToKeep((current) => (
      current.includes(rowId)
        ? current.filter((selectedId) => selectedId !== rowId)
        : [...current, rowId]
    ));
  };

  const handleResolveDuplicateRows = async () => {
    if (!duplicateImportBatch?.id) {
      return;
    }

    setIsUploading(true);
    setStatus('Resolving duplicate rows...');

    try {
      const response = await api.post(`/statements/upload/duplicates/${duplicateImportBatch.id}`, {
        keep_duplicate_ids: duplicateRowsToKeep,
      });
      setStatus(
        `Kept ${response.data.imported_duplicates} duplicate rows and discarded ${response.data.discarded_duplicates}.`,
      );
      setDuplicateImportBatch(null);
      setDuplicateRowsToKeep([]);
      await Promise.all([
        loadCategorizationSuggestions(0),
        loadCategoryDashboard(0),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not resolve duplicate rows. Try uploading the file again.';
      setStatus(detail);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCustomCategoryChange = (merchantKey, category) => {
    setCustomCategories((current) => ({
      ...current,
      [merchantKey]: category,
    }));
  };

  const handleApplyCategory = async (merchantKey, category, excludedMerchants = []) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      return;
    }

    setIsCategorizing(true);
    setStatus(`Categorizing ${merchantKey} as ${trimmedCategory}...`);

    try {
      const response = await api.post('/transactions/categorize', {
        merchant_key: merchantKey,
        category: trimmedCategory,
        excluded_merchants: excludedMerchants,
      });
      setStatus(`Categorized ${response.data.updated_transactions} transactions as ${trimmedCategory}.`);
      setCustomCategories((current) => ({
        ...current,
        [merchantKey]: '',
      }));
      setCategoryDetails((current) => ({
        ...current,
        uncategorized_groups: (current.uncategorized_groups || []).filter((group) => group.merchant_key !== merchantKey),
        uncategorized_total: Math.max((current.uncategorized_total || 0) - 1, 0),
      }));
      setSelectedUncategorizedGroups((current) => current.filter((selectedKey) => selectedKey !== merchantKey));
      const nextPage = categorizationGroups.length <= 1 && categorizationPage > 0
        ? categorizationPage - 1
        : categorizationPage;
      await Promise.all([
        loadCategorizationSuggestions(nextPage),
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not apply the category. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleApplySelectedCategories = async (merchantKeys, category) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory || !merchantKeys.length) {
      return;
    }

    setIsCategorizing(true);
    setStatus(`Categorizing ${merchantKeys.length} merchant groups as ${trimmedCategory}...`);

    try {
      const responses = await Promise.all(
        merchantKeys.map((merchantKey) => (
          api.post('/transactions/categorize', {
            merchant_key: merchantKey,
            category: trimmedCategory,
            excluded_merchants: categoryGroupExclusions[merchantKey] || [],
          })
        )),
      );
      const updatedTransactions = responses.reduce(
        (total, response) => total + (response.data.updated_transactions || 0),
        0,
      );
      setStatus(`Categorized ${updatedTransactions} transactions as ${trimmedCategory}.`);
      setCustomCategories((current) => ({
        ...current,
        [batchCategoryKey]: '',
      }));
      setCategoryDetails((current) => ({
        ...current,
        uncategorized_groups: (current.uncategorized_groups || []).filter(
          (group) => !merchantKeys.includes(group.merchant_key),
        ),
        uncategorized_total: Math.max((current.uncategorized_total || 0) - merchantKeys.length, 0),
      }));
      setSelectedUncategorizedGroups([]);
      await Promise.all([
        loadCategorizationSuggestions(0),
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not apply the category. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleAutomation = async () => {
    setIsAutomating(true);
    setStatus('Opening Simplii in Chrome...');

    try {
      const response = await api.post('/statements/download', { banks: [{ bank_id: 'simplii', account_ids: [] }] });
      setAutomationAccountStatuses(response.data.accounts || []);
      setStatus(response.data.message || 'Simplii browser flow could not be started.');
    } catch (error) {
      const detail = error?.response?.data?.message || error?.message || 'Simplii browser flow could not be started.';
      setStatus(detail);
    } finally {
      setIsAutomating(false);
    }
  };

  const resetCategorizationState = () => {
    setCategorizationGroups([]);
    setCategorizationPage(0);
    setCategorizationTotal(0);
    setCategorizationHasMore(false);
    setCustomCategories({});
  };

  const handleClearTransactions = async () => {
    const shouldClear = window.confirm('Clear all imported transactions? This cannot be undone.');
    if (!shouldClear) {
      return;
    }

    setIsClearingTransactions(true);
    setStatus('Clearing transactions...');

    try {
      const response = await api.delete('/transactions');
      setStatus(`Cleared ${response.data.deleted_transactions} transactions.`);
      resetCategorizationState();
      setCategoryOptions([]);
      setCategorySummary([]);
      setCategoryDetails({
        categories: [],
        uncategorized_groups: [],
        uncategorized_total: 0,
        uncategorized_has_more: false,
      });
      setUncategorizedCategoryPage(0);
      setCategoryEdits({});
      setCategoryGroupExclusions({});
      setSelectedUncategorizedGroups([]);
      await loadSummary();
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not clear transactions. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsClearingTransactions(false);
    }
  };

  const handleClearCategories = async () => {
    const shouldClear = window.confirm('Clear all category assignments? Transactions will be kept.');
    if (!shouldClear) {
      return;
    }

    setIsClearingCategories(true);
    setStatus('Clearing categories...');

    try {
      const response = await api.delete('/transactions/categories');
      setStatus(`Cleared categories from ${response.data.updated_transactions} transactions.`);
      setCategoryOptions([]);
      setCategorySummary([]);
      setCategoryDetails({
        categories: [],
        uncategorized_groups: [],
        uncategorized_total: 0,
        uncategorized_has_more: false,
      });
      setUncategorizedCategoryPage(0);
      setCategoryEdits({});
      setCategoryGroupExclusions({});
      setSelectedUncategorizedGroups([]);
      await Promise.all([
        loadCategorizationSuggestions(0),
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not clear categories. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsClearingCategories(false);
    }
  };

  const handleCategorizationPageChange = (nextPage) => {
    loadCategorizationSuggestions(nextPage);
  };
  const handleUncategorizedCategoryPageChange = (nextPage) => {
    loadCategoryDashboard(nextPage);
  };
  const handleCategoryEditChange = (categoryName, nextName) => {
    setCategoryEdits((current) => ({
      ...current,
      [categoryName]: nextName,
    }));
  };
  const handleRenameCategory = async (currentCategory, newCategory) => {
    const trimmedCategory = newCategory.trim();
    if (!trimmedCategory || trimmedCategory === currentCategory) {
      return;
    }

    setIsRenamingCategory(true);
    setStatus(`Renaming ${currentCategory} to ${trimmedCategory}...`);

    try {
      const response = await api.patch('/transactions/categories', {
        current_category: currentCategory,
        new_category: trimmedCategory,
      });
      setStatus(`Renamed ${response.data.updated_transactions} transactions to ${trimmedCategory}.`);
      await Promise.all([
        loadCategoryDashboard(),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not rename the category. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsRenamingCategory(false);
    }
  };

  const handleRemoveCategorizedMerchant = async (category, merchant) => {
    setStatus(`Removing ${merchant} from ${category}...`);

    try {
      const response = await api.post('/transactions/categories/remove-merchant', {
        category,
        merchant,
      });
      setStatus(`Removed ${response.data.updated_transactions} transactions from ${category}.`);
      await Promise.all([
        loadCategorizationSuggestions(0),
        loadCategoryDashboard(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not remove the merchant. Make sure the backend is running.';
      setStatus(detail);
    }
  };

  const handleExcludeUncategorizedMerchant = (merchantKey, merchant) => {
    setCategoryGroupExclusions((current) => ({
      ...current,
      [merchantKey]: Array.from(new Set([...(current[merchantKey] || []), merchant])),
    }));
  };

  const handleToggleUncategorizedGroup = (merchantKey) => {
    setSelectedUncategorizedGroups((current) => (
      current.includes(merchantKey)
        ? current.filter((selectedKey) => selectedKey !== merchantKey)
        : [...current, merchantKey]
    ));
  };

  const handleToggleVisibleUncategorizedGroups = (merchantKeys) => {
    setSelectedUncategorizedGroups((current) => {
      const visibleKeySet = new Set(merchantKeys);
      const areAllVisibleSelected = merchantKeys.every((merchantKey) => current.includes(merchantKey));

      if (areAllVisibleSelected) {
        return current.filter((merchantKey) => !visibleKeySet.has(merchantKey));
      }

      return Array.from(new Set([...current, ...merchantKeys]));
    });
  };

  const handleClearSelectedUncategorizedGroups = () => {
    setSelectedUncategorizedGroups([]);
  };

  const handleAddAccountValueRow = async (year = 2026) => {
    const monthEnd = `${year}-12-31`;
    try {
      const response = await api.post('/account-values', {
        year,
        month_end: monthEnd,
        projected: 0,
        recorded_date: monthEnd,
        notes: '',
        accounts: [],
        contributions: [],
      });
      setAccountValueRows((current) => [normalizeAccountSnapshot(response.data), ...current]);
    } catch (error) {
      setStatus('Could not add an account value row. Make sure the backend is running.');
    }
  };

  const handleUpdateAccountValueRow = async (rowId, field, value) => {
    const currentRow = accountValueRows.find((row) => row.id === rowId);
    if (!currentRow) {
      return;
    }

    const nextRow = field.startsWith('account:')
      ? {
        ...currentRow,
        accounts: {
          ...currentRow.accounts,
          [field.slice('account:'.length)]: value,
        },
      }
      : field.startsWith('contribution:')
        ? {
          ...currentRow,
          contributions: {
            ...currentRow.contributions,
            [field.slice('contribution:'.length)]: value,
          },
        }
      : { ...currentRow, [field]: value };

    setAccountValueRows((current) => (
      current.map((row) => (row.id === rowId ? nextRow : row))
    ));

    if (!nextRow.monthEnd) {
      return;
    }

    try {
      const response = await api.patch(`/account-values/${rowId}`, accountRowPayload(nextRow));
      setAccountValueRows((current) => (
        current.map((row) => (row.id === rowId ? normalizeAccountSnapshot(response.data) : row))
      ));
    } catch (error) {
      setStatus('Could not save the account value row. Make sure the backend is running.');
    }
  };

  const handleDeleteAccountValueRow = async (rowId) => {
    try {
      await api.delete(`/account-values/${rowId}`);
      setAccountValueRows((current) => current.filter((row) => row.id !== rowId));
    } catch (error) {
      setStatus('Could not delete the account value row. Make sure the backend is running.');
    }
  };

  const accountValueRowsForYear = (year) => (
    accountValueRows.filter((row) => (
      (row.year || Number(row.monthEnd?.slice(0, 4)) || 2026) === year
    ))
  );

  const uniqueAccountValueColumnName = (year, section) => {
    const valueKey = section === 'contributions' ? 'contributions' : 'accounts';
    const existingNames = new Set(
      accountValueRowsForYear(year).flatMap((row) => Object.keys(row[valueKey] || {})),
    );
    const baseName = section === 'contributions' ? 'New investment contribution' : 'New account';

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let suffix = 2;
    while (existingNames.has(`${baseName} ${suffix}`)) {
      suffix += 1;
    }
    return `${baseName} ${suffix}`;
  };

  const handleAddAccountValueColumn = async (year, section) => {
    const columnName = uniqueAccountValueColumnName(year, section);
    const targetRows = accountValueRowsForYear(year);
    const valueKey = section === 'contributions' ? 'contributions' : 'accounts';

    const nextRows = accountValueRows.map((row) => (
      targetRows.some((targetRow) => targetRow.id === row.id)
        ? {
          ...row,
          [valueKey]: {
            ...row[valueKey],
            [columnName]: '0',
          },
        }
        : row
    ));

    setAccountValueRows(nextRows);

    try {
      await Promise.all(
        nextRows
          .filter((row) => targetRows.some((targetRow) => targetRow.id === row.id) && row.monthEnd)
          .map((row) => api.patch(`/account-values/${row.id}`, accountRowPayload(row))),
      );
      await loadAccountValues();
    } catch (error) {
      setStatus('Could not add the account value column. Make sure the backend is running.');
      await loadAccountValues();
    }
  };

  const handleRenameAccountValueColumn = async (year, section, currentColumnName, nextColumnName) => {
    const trimmedColumnName = nextColumnName.trim();
    if (!trimmedColumnName || trimmedColumnName === currentColumnName) {
      return;
    }

    const targetRows = accountValueRows.filter((row) => (
      (row.year || Number(row.monthEnd?.slice(0, 4)) || 2026) === year
    ));
    const valueKey = section === 'contributions' ? 'contributions' : 'accounts';
    const nextRows = accountValueRows.map((row) => (
      targetRows.some((targetRow) => targetRow.id === row.id)
        ? {
          ...row,
          [valueKey]: Object.entries(row[valueKey] || {}).reduce((values, [name, value]) => {
            if (name === currentColumnName) {
              return {
                ...values,
                [trimmedColumnName]: values[trimmedColumnName] ?? value,
              };
            }
            return {
              ...values,
              [name]: value,
            };
          }, {}),
        }
        : row
    ));

    setAccountValueRows(nextRows);

    try {
      await Promise.all(
        nextRows
          .filter((row) => targetRows.some((targetRow) => targetRow.id === row.id) && row.monthEnd)
          .map((row) => api.patch(`/account-values/${row.id}`, accountRowPayload(row))),
      );
      await loadAccountValues();
    } catch (error) {
      setStatus('Could not rename the account value column. Make sure the backend is running.');
      await loadAccountValues();
    }
  };

  const handleDeleteAccountValueColumn = async (year, section, columnName) => {
    const targetRows = accountValueRowsForYear(year);
    const valueKey = section === 'contributions' ? 'contributions' : 'accounts';
    const nextRows = accountValueRows.map((row) => (
      targetRows.some((targetRow) => targetRow.id === row.id)
        ? {
          ...row,
          [valueKey]: Object.fromEntries(
            Object.entries(row[valueKey] || {}).filter(([name]) => name !== columnName),
          ),
        }
        : row
    ));

    setAccountValueRows(nextRows);

    try {
      await Promise.all(
        nextRows
          .filter((row) => targetRows.some((targetRow) => targetRow.id === row.id) && row.monthEnd)
          .map((row) => api.patch(`/account-values/${row.id}`, accountRowPayload(row))),
      );
      await loadAccountValues();
    } catch (error) {
      setStatus('Could not delete the account value column. Make sure the backend is running.');
      await loadAccountValues();
    }
  };

  const postAccountValueImport = async (year, file, mapping = null) => {
    const formData = new FormData();
    formData.append('year', String(year));
    formData.append('file', file);
    if (mapping) {
      formData.append('column_mapping', JSON.stringify(mapping));
    }

    const response = await api.post('/account-values/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setStatus(`Imported ${response.data.imported_snapshots} account value rows for ${year}.`);
    await loadAccountValues();
    setAccountImportDraft(null);
  };

  const handleImportAccountValues = async (year, file) => {
    const text = await file.text();
    const rows = parseCsvPreview(text);
    const headers = rows[0] || [];
    const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());

    if (normalizedHeaders.includes('month end')) {
      try {
        await postAccountValueImport(year, file);
      } catch (error) {
        const detail = error?.response?.data?.detail || 'Could not import account values.';
        setStatus(detail);
      }
      return;
    }

    setAccountImportDraft({
      year,
      file,
      preview: rows,
      mapping: {
        ...emptyAccountImportMapping,
        projected: normalizedHeaders.includes('projected') ? String(normalizedHeaders.indexOf('projected')) : '',
        actual: normalizedHeaders.includes('actual') ? String(normalizedHeaders.indexOf('actual')) : '',
        diff: normalizedHeaders.includes('diff') ? String(normalizedHeaders.indexOf('diff')) : '',
        date: normalizedHeaders.includes('date') ? String(normalizedHeaders.indexOf('date')) : '',
        notes: normalizedHeaders.includes('notes') ? String(normalizedHeaders.indexOf('notes')) : '',
      },
    });
    setStatus('Map the account value CSV columns, then import.');
  };

  const handleAccountImportRoleChange = (columnIndex, role) => {
    setAccountImportDraft((current) => {
      if (!current) {
        return current;
      }

      const columnValue = String(columnIndex);
      const nextMapping = {
        ...current.mapping,
        accounts: (current.mapping.accounts || []).filter((value) => value !== columnValue),
        contributions: (current.mapping.contributions || []).filter((value) => value !== columnValue),
      };

      Object.entries(nextMapping).forEach(([key, value]) => {
        if (!['accounts', 'contributions'].includes(key) && value === columnValue) {
          nextMapping[key] = '';
        }
      });

      if (role === 'account') {
        nextMapping.accounts = [...nextMapping.accounts, columnValue];
      } else if (role === 'contribution') {
        nextMapping.contributions = [...nextMapping.contributions, columnValue];
      } else if (role) {
        nextMapping[role] = columnValue;
      }

      return { ...current, mapping: nextMapping };
    });
  };

  const handleConfirmAccountImport = async () => {
    if (!accountImportDraft) {
      return;
    }

    const baseColumnIndexes = Object.entries(accountImportDraft.mapping)
      .filter(([key, value]) => !['accounts', 'contributions'].includes(key) && value !== '')
      .map(([, value]) => Number(value));
    const contributionColumnIndexes = (accountImportDraft.mapping.contributions || []).map(Number);
    const columnCount = accountImportDraft.preview.reduce((count, row) => Math.max(count, row.length), 0);
    const defaultAccountColumns = Array.from({ length: columnCount }, (_, index) => index)
      .filter((index) => !baseColumnIndexes.includes(index) && !contributionColumnIndexes.includes(index));

    const mapping = {
      ...Object.fromEntries(
        Object.entries(accountImportDraft.mapping)
          .filter(([key, value]) => !['accounts', 'contributions'].includes(key) && value !== '')
          .map(([key, value]) => [key, Number(value)]),
      ),
      accounts: defaultAccountColumns,
      contributions: contributionColumnIndexes,
    };

    try {
      await postAccountValueImport(accountImportDraft.year, accountImportDraft.file, mapping);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not import account values.';
      setStatus(detail);
    }
  };

  const handleCancelAccountImport = () => {
    setAccountImportDraft(null);
    setStatus('Account value import canceled.');
  };

  return (
    <main className="app-shell">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'import' ? (
        <ImportTab
          automationProfiles={automationProfiles}
          automationAccountStatuses={automationAccountStatuses}
          columnMapping={columnMapping}
          columnOptions={columnOptions}
          categoryOptions={categoryOptions}
          customCategories={customCategories}
          csvPreview={csvPreview}
          categorizationHasMore={categorizationHasMore}
          categorizationGroups={categorizationGroups}
          categorizationPage={categorizationPage}
          categorizationPageSize={categorizationPageSize}
          categorizationTotal={categorizationTotal}
          hasHeader={hasHeader}
          amountSign={amountSign}
          duplicateImportBatch={duplicateImportBatch}
          duplicateRowsToKeep={duplicateRowsToKeep}
          isAutomating={isAutomating}
          isCategorizing={isCategorizing}
          isClearingCategories={isClearingCategories}
          isClearingTransactions={isClearingTransactions}
          isUploading={isUploading}
          onAutomation={handleAutomation}
          onApplyCategory={handleApplyCategory}
          onCategorizationPageChange={handleCategorizationPageChange}
          onClearCategories={handleClearCategories}
          onClearTransactions={handleClearTransactions}
          onCustomCategoryChange={handleCustomCategoryChange}
          onFileChange={handleFileChange}
          onHeaderChange={setHasHeader}
          onAmountSignChange={setAmountSign}
          onResolveDuplicateRows={handleResolveDuplicateRows}
          onToggleDuplicateRow={handleToggleDuplicateRow}
          onUpdateColumnRole={updateColumnRole}
          onUpload={handleUpload}
          previewGridStyle={previewGridStyle}
          previewRows={previewRows}
          selectedFile={selectedFile}
          status={status}
        />
      ) : activeTab === 'categories' ? (
        <CategoriesTab
          categories={categorySummary}
          categoryDetails={categoryDetails}
          categoryEdits={categoryEdits}
          categoryGroupExclusions={categoryGroupExclusions}
          categoryOptions={categoryOptions}
          customCategories={customCategories}
          isCategorizing={isCategorizing}
          isRenamingCategory={isRenamingCategory}
          onApplyCategory={handleApplyCategory}
          onApplySelectedCategories={handleApplySelectedCategories}
          onCategoryEditChange={handleCategoryEditChange}
          onClearSelectedUncategorizedGroups={handleClearSelectedUncategorizedGroups}
          onCustomCategoryChange={handleCustomCategoryChange}
          onExcludeUncategorizedMerchant={handleExcludeUncategorizedMerchant}
          onRemoveCategorizedMerchant={handleRemoveCategorizedMerchant}
          onRenameCategory={handleRenameCategory}
          onToggleUncategorizedGroup={handleToggleUncategorizedGroup}
          onToggleVisibleUncategorizedGroups={handleToggleVisibleUncategorizedGroups}
          onUncategorizedPageChange={handleUncategorizedCategoryPageChange}
          selectedUncategorizedGroups={selectedUncategorizedGroups}
          uncategorizedPage={uncategorizedCategoryPage}
          uncategorizedPageSize={uncategorizedCategoryPageSize}
        />
      ) : activeTab === 'accounts' ? (
        <AccountValuesTab
          rows={accountValueRows}
          importDraft={accountImportDraft}
          onAddRow={handleAddAccountValueRow}
          onCancelImport={handleCancelAccountImport}
          onConfirmImport={handleConfirmAccountImport}
          onDeleteRow={handleDeleteAccountValueRow}
          onImportYear={handleImportAccountValues}
          onImportRoleChange={handleAccountImportRoleChange}
          onAddColumn={handleAddAccountValueColumn}
          onDeleteColumn={handleDeleteAccountValueColumn}
          onRenameColumn={handleRenameAccountValueColumn}
          onUpdateRow={handleUpdateAccountValueRow}
        />
      ) : (
        <AnalyticsTab
          categoryOptions={categoryOptions}
          onCategoryChange={setAnalyticsCategory}
          onTimeframeChange={setAnalyticsTimeframeDays}
          selectedCategory={analyticsCategory}
          selectedTimeframeDays={analyticsTimeframeDays}
          summary={summary}
        />
      )}
    </main>
  );
}

export default App;
