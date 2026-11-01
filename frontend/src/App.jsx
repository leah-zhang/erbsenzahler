import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from './api/client';
import { AppHeader } from './components/AppHeader';
import { AccountValuesTab } from './components/AccountValuesTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { CategoriesTab } from './components/CategoriesTab';
import { ImportTab } from './components/ImportTab';
import { TransactionsTab } from './components/TransactionsTab';
import { TabBar } from './components/TabBar';
import { readImportPreferences, writeImportPreferences } from './utils/importProfiles';
import { parseCsvPreview, serializeCsv } from './utils/csvPreview';

const emptyColumnMapping = {
  date: '',
  description: '',
  amount: '',
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

const uncategorizedCategoryPageSize = 20;
const batchCategoryKey = '__batch_uncategorized__';

function App() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [recentImports, setRecentImports] = useState([]);
  const [hasImportedStatement, setHasImportedStatement] = useState(false);
  const [feedbackByTab, setFeedbackByTab] = useState({
    import: { message: 'Ready to load statements', type: 'info' },
  });

  // Each async action keeps the tab from the render in which it started.
  const setStatus = (message, type = 'info', tab = activeTab) => {
    const text = typeof message === 'string' ? message
      : Array.isArray(message) ? message.map((item) => item.msg || 'Invalid value.').join(' ')
        : message?.message || 'The action could not be completed. Please try again.';
    setFeedbackByTab((current) => ({ ...current, [tab]: { message: text, type } }));
  };

  const dismissFeedback = (tab) => {
    setFeedbackByTab((current) => ({ ...current, [tab]: null }));
  };
  const [loadStates, setLoadStates] = useState(Object.fromEntries(
    ['analytics', 'categories', 'accounts', 'recent'].map((key) => [key, { loading: true, error: false }]),
  ));
  const loadRequests = useRef({});
  const beginLoad = (key) => {
    const request = (loadRequests.current[key] || 0) + 1;
    loadRequests.current[key] = request;
    setLoadStates((current) => ({ ...current, [key]: { loading: true, error: false } }));
    return request;
  };
  const finishLoad = (key, request, error = false) => {
    if (loadRequests.current[key] !== request) return;
    setLoadStates((current) => ({ ...current, [key]: { loading: false, error } }));
  };
  const [analyticsTimeframeDays, setAnalyticsTimeframeDays] = useState(90);
  const [analyticsCategory, setAnalyticsCategory] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [importRowError, setImportRowError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [isClearingTransactions, setIsClearingTransactions] = useState(false);
  const [isClearingCategories, setIsClearingCategories] = useState(false);
  const [csvPreview, setCsvPreview] = useState([]);
  const [duplicateImportBatch, setDuplicateImportBatch] = useState(null);
  const [duplicateRowsToKeep, setDuplicateRowsToKeep] = useState([]);
  const [importPreferences, setImportPreferences] = useState(readImportPreferences);
  const initialProfile = importPreferences.profiles.find((profile) => profile.id === importPreferences.selectedId);
  const [profileName, setProfileName] = useState(initialProfile?.name || '');
  const [defaultAccount, setDefaultAccount] = useState(initialProfile?.defaultAccount || '');
  const [importAccounts, setImportAccounts] = useState([]);
  const [hasHeader, setHasHeader] = useState(initialProfile?.hasHeader ?? true);
  const [amountSign, setAmountSign] = useState(initialProfile?.amountSign || 'spend_positive');
  const [columnMapping, setColumnMapping] = useState(initialProfile?.columnMapping || emptyColumnMapping);
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
  const [customCategories, setCustomCategories] = useState({});
  const [accountValueRows, setAccountValueRows] = useState([]);
  const [accountImportDraft, setAccountImportDraft] = useState(null);

  const loadSummary = async () => {
    const request = beginLoad('analytics');
    try {
      const response = await api.get('/analytics/monthly', {
        params: {
          weekly_days: analyticsTimeframeDays,
          weekly_category: analyticsCategory,
        },
      });
      if (loadRequests.current.analytics !== request) return;
      setSummary(response.data);
      finishLoad('analytics', request);
    } catch {
      finishLoad('analytics', request, true);
    }
  };

  useEffect(() => {
    loadCategoryDashboard();
    loadAccountValues();
    loadRecentImports();
    loadImportAccounts();
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

  const loadImportAccounts = async () => {
    try {
      const response = await api.get('/transactions/accounts');
      setImportAccounts(response.data.accounts || []);
    } catch { /* Account suggestions are optional; a name can always be entered. */ }
  };

  const applyImportProfile = (profile) => {
    setHasHeader(profile?.hasHeader ?? true);
    setAmountSign(profile?.amountSign || 'spend_positive');
    setColumnMapping(profile?.columnMapping || emptyColumnMapping);
    setDefaultAccount(profile?.defaultAccount || '');
    setProfileName(profile?.name || '');
    setImportRowError(null);
  };

  const selectImportProfile = (id) => {
    const profile = importPreferences.profiles.find((item) => item.id === id);
    setImportPreferences((current) => ({ ...current, selectedId: id }));
    applyImportProfile(profile);
    try { writeImportPreferences(importPreferences.profiles, id); } catch { /* Settings still apply to this import. */ }
  };

  const saveImportProfile = () => {
    const name = profileName.trim();
    if (!name) { setStatus('Enter a name for this import setup.', 'error'); return; }
    const id = importPreferences.selectedId || crypto.randomUUID();
    const profile = { id, name, columnMapping, hasHeader, amountSign, defaultAccount: defaultAccount.trim(), columnCount: columnOptions.length, columnHeaders: hasHeader ? (csvPreview[0] || []) : [] };
    const profiles = [...importPreferences.profiles.filter((item) => item.id !== id), profile];
    try {
      writeImportPreferences(profiles, id);
      setImportPreferences({ profiles, selectedId: id });
      setStatus(`Saved import setup "${name}" in this browser.`, 'success');
    } catch { setStatus('Could not save the setup in this browser. You can still import with these settings.', 'error'); }
  };

  const deleteImportProfile = () => {
    const profiles = importPreferences.profiles.filter((item) => item.id !== importPreferences.selectedId);
    try {
      writeImportPreferences(profiles, '');
      setImportPreferences({ profiles, selectedId: '' });
      setProfileName('');
      setStatus('Saved import setup removed. Current column settings are still available.', 'success');
    } catch { setStatus('Could not remove this saved setup. Please try again.', 'error'); }
  };

  const loadRecentImports = async () => {
    const request = beginLoad('recent');
    try {
      const response = await api.get('/statements/recent');
      if (loadRequests.current.recent !== request) return;
      setRecentImports(response.data.statements || []);
      finishLoad('recent', request);
    } catch {
      finishLoad('recent', request, true);
    }
  };

  const loadAccountValues = async () => {
    const request = beginLoad('accounts');
    try {
      const response = await api.get('/account-values');
      if (loadRequests.current.accounts !== request) return;
      setAccountValueRows((response.data.snapshots || []).map(normalizeAccountSnapshot));
      finishLoad('accounts', request);
    } catch {
      finishLoad('accounts', request, true);
    }
  };

  const loadCategoryDashboard = async (page = uncategorizedCategoryPage) => {
    const request = beginLoad('categories');
    try {
      const offset = page * uncategorizedCategoryPageSize;
      const response = await api.get('/transactions/category-dashboard', {
        params: {
          uncategorized_limit: uncategorizedCategoryPageSize,
          uncategorized_offset: offset,
        },
      });
      if (loadRequests.current.categories !== request) return;
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
      finishLoad('categories', request);
    } catch {
      finishLoad('categories', request, true);
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
    setImportRowError(null);
    setCsvPreview([]);
    applyImportProfile(importPreferences.profiles.find((item) => item.id === importPreferences.selectedId));
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
    setStatus(rows.length ? 'Map the CSV columns, then import.' : 'Could not read any rows from this CSV.', rows.length ? 'info' : 'error');
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

  const handleUpload = async (fileToUpload = selectedFile) => {
    if (!fileToUpload) {
      setStatus('Please choose a statement file first.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('has_header', String(hasHeader));
    formData.append('amount_sign', amountSign);
    formData.append('default_account', defaultAccount.trim() || 'bank');
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
    setImportRowError(null);
    setStatus(`Uploading ${fileToUpload.name}...`);

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
        'success',
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
      await Promise.all([loadRecentImports(), loadImportAccounts()]);
      setHasImportedStatement(true);
      setSelectedFile(null);
      setCsvPreview([]);
      setCustomCategories({});
      await Promise.all([
        loadCategoryDashboard(0),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Upload failed. Make sure the backend is running and the CSV has Date, Description, and Amount columns.';
      if (detail && typeof detail === 'object' && detail.row_number) {
        const width = Math.max(detail.row.length, columnOptions.length);
        setImportRowError({ ...detail, row: Array.from({ length: width }, (_, index) => detail.row[index] ?? '') });
        setStatus(`Row ${detail.row_number}: ${detail.message} Edit or delete this row to continue.`, 'error');
      } else {
        setStatus(typeof detail === 'string' ? detail : 'Upload failed. Check the CSV column mapping.', 'error');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleResolveImportRow = async (deleteRow = false) => {
    if (!selectedFile || !importRowError) return;
    const rows = parseCsvPreview(await selectedFile.text(), Infinity, true);
    const index = importRowError.row_number - 1;
    if (deleteRow) rows.splice(index, 1);
    else rows[index] = importRowError.row;
    const correctedFile = new File([serializeCsv(rows)], selectedFile.name, { type: 'text/csv' });
    setSelectedFile(correctedFile);
    setCsvPreview(rows.slice(0, 6));
    await handleUpload(correctedFile);
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
        'success',
      );
      setDuplicateImportBatch(null);
      setDuplicateRowsToKeep([]);
      await Promise.all([
        loadCategoryDashboard(0),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not resolve duplicate rows. Try uploading the file again.';
      setStatus(detail, 'error');
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
      setStatus(`Categorized ${response.data.updated_transactions} transactions as ${trimmedCategory}.`, 'success');
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
      await Promise.all([
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not apply the category. Make sure the backend is running.';
      setStatus(detail, 'error');
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
      setStatus(`Categorized ${updatedTransactions} transactions as ${trimmedCategory}.`, 'success');
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
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not apply the category. Make sure the backend is running.';
      setStatus(detail, 'error');
    } finally {
      setIsCategorizing(false);
    }
  };

  const resetCategorizationState = () => {
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
      setStatus(`Cleared ${response.data.deleted_transactions} transactions.`, 'success');
      resetCategorizationState();
      await loadRecentImports();
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
      setStatus(detail, 'error');
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
      setStatus(`Cleared categories from ${response.data.updated_transactions} transactions.`, 'success');
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
        loadCategoryDashboard(0),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not clear categories. Make sure the backend is running.';
      setStatus(detail, 'error');
    } finally {
      setIsClearingCategories(false);
    }
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
      setStatus(`Renamed ${response.data.updated_transactions} transactions to ${trimmedCategory}.`, 'success');
      await Promise.all([
        loadCategoryDashboard(),
        loadSummary(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not rename the category. Make sure the backend is running.';
      setStatus(detail, 'error');
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
      setStatus(`Removed ${response.data.updated_transactions} transactions from ${category}.`, 'success');
      await Promise.all([
        loadCategoryDashboard(),
      ]);
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not remove the merchant. Make sure the backend is running.';
      setStatus(detail, 'error');
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
      setStatus('Account value row added.', 'success');
    } catch (error) {
      setStatus('Could not add an account value row. Make sure the backend is running.', 'error');
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
      setStatus('Choose a month end date to save this row.', 'error');
      return;
    }

    try {
      const response = await api.patch(`/account-values/${rowId}`, accountRowPayload(nextRow));
      setAccountValueRows((current) => (
        current.map((row) => (row.id === rowId ? normalizeAccountSnapshot(response.data) : row))
      ));
      setStatus('Account value row saved.', 'success');
    } catch (error) {
      setStatus('Could not save the account value row. Make sure the backend is running.', 'error');
    }
  };

  const handleDeleteAccountValueRow = async (rowId) => {
    try {
      await api.delete(`/account-values/${rowId}`);
      setAccountValueRows((current) => current.filter((row) => row.id !== rowId));
      setStatus('Account value row deleted.', 'success');
    } catch (error) {
      setStatus('Could not delete the account value row. Make sure the backend is running.', 'error');
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
      setStatus('Account value column added.', 'success');
    } catch (error) {
      setStatus('Could not add the account value column. Make sure the backend is running.', 'error');
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
      setStatus('Account value column renamed.', 'success');
    } catch (error) {
      setStatus('Could not rename the account value column. Make sure the backend is running.', 'error');
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
      setStatus('Account value column deleted.', 'success');
    } catch (error) {
      setStatus('Could not delete the account value column. Make sure the backend is running.', 'error');
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
    setStatus(`Imported ${response.data.imported_snapshots} account value rows for ${year}.`, 'success');
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
        setStatus(detail, 'error');
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
      setStatus(detail, 'error');
    }
  };

  const handleCancelAccountImport = () => {
    setAccountImportDraft(null);
    setStatus('Account value import canceled.');
  };

  const categorizationProps = {
    categoryDetails: categoryDetails,
    categoryGroupExclusions: categoryGroupExclusions,
    categoryOptions: Array.from(new Set([...categoryOptions, ...categorySummary.map((category) => category.name)])),
    customCategories: customCategories,
    isCategorizing: isCategorizing,
    onApplyCategory: handleApplyCategory,
    onApplySelectedCategories: handleApplySelectedCategories,
    onClearSelectedUncategorizedGroups: handleClearSelectedUncategorizedGroups,
    onCustomCategoryChange: handleCustomCategoryChange,
    onExcludeUncategorizedMerchant: handleExcludeUncategorizedMerchant,
    onToggleUncategorizedGroup: handleToggleUncategorizedGroup,
    onToggleVisibleUncategorizedGroups: handleToggleVisibleUncategorizedGroups,
    onUncategorizedPageChange: handleUncategorizedCategoryPageChange,
    selectedUncategorizedGroups: selectedUncategorizedGroups,
    uncategorizedPage: uncategorizedCategoryPage,
    uncategorizedPageSize: uncategorizedCategoryPageSize,
  };

  return (
    <main className="app-shell">
      <AppHeader onHome={() => setActiveTab('analytics')} />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'import' ? (
        <ImportTab
          showCategorization={hasImportedStatement && (categoryDetails.uncategorized_total > 0 || loadStates.categories.loading || loadStates.categories.error)}
          categoryLoadState={loadStates.categories}
          onRetryCategories={() => loadCategoryDashboard()}
          categorizationProps={categorizationProps}
          recentImportsLoadState={loadStates.recent}
          recentImports={recentImports}
          onRetryRecentImports={loadRecentImports}
          importProfiles={importPreferences.profiles}
          selectedProfileId={importPreferences.selectedId}
          profileName={profileName}
          onProfileNameChange={setProfileName}
          onSelectProfile={selectImportProfile}
          onSaveProfile={saveImportProfile}
          onDeleteProfile={deleteImportProfile}
          defaultAccount={defaultAccount}
          onDefaultAccountChange={setDefaultAccount}
          importAccounts={importAccounts}
          columnMapping={columnMapping}
          columnOptions={columnOptions}
          csvPreview={csvPreview}
          hasHeader={hasHeader}
          amountSign={amountSign}
          duplicateImportBatch={duplicateImportBatch}
          duplicateRowsToKeep={duplicateRowsToKeep}
          isClearingCategories={isClearingCategories}
          isClearingTransactions={isClearingTransactions}
          isUploading={isUploading}
          onClearCategories={handleClearCategories}
          onClearTransactions={handleClearTransactions}
          onFileChange={handleFileChange}
          onHeaderChange={setHasHeader}
          onAmountSignChange={setAmountSign}
          onResolveDuplicateRows={handleResolveDuplicateRows}
          onToggleDuplicateRow={handleToggleDuplicateRow}
          onUpdateColumnRole={updateColumnRole}
          onUpload={() => handleUpload()}
          importRowError={importRowError}
          onImportRowChange={(index, value) => setImportRowError((current) => ({
            ...current, row: current.row.map((cell, cellIndex) => cellIndex === index ? value : cell),
          }))}
          onResolveImportRow={handleResolveImportRow}
          previewGridStyle={previewGridStyle}
          previewRows={previewRows}
          selectedFile={selectedFile}
          feedback={feedbackByTab.import}
        />
      ) : activeTab === 'transactions' ? (
        <TransactionsTab
          feedback={feedbackByTab.transactions}
          onFeedback={(feedback) => setStatus(feedback.message, feedback.type, 'transactions')}
          onDismissFeedback={() => dismissFeedback('transactions')}
          onChanged={() => { loadSummary(); loadCategoryDashboard(); }}
        />
      ) : activeTab === 'categories' ? (
        <CategoriesTab
          loadState={loadStates.categories}
          onRetry={() => loadCategoryDashboard()}
          feedback={feedbackByTab.categories}
          onDismissFeedback={() => dismissFeedback('categories')}
          categorizationProps={categorizationProps}
          categories={categorySummary}
          categoryEdits={categoryEdits}
          isRenamingCategory={isRenamingCategory}
          onCategoryEditChange={handleCategoryEditChange}
          onRemoveCategorizedMerchant={handleRemoveCategorizedMerchant}
          onRenameCategory={handleRenameCategory}
        />
      ) : activeTab === 'accounts' ? (
        <AccountValuesTab
          loadState={loadStates.accounts}
          onRetry={loadAccountValues}
          feedback={feedbackByTab.accounts}
          onDismissFeedback={() => dismissFeedback('accounts')}
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
          loadState={loadStates.analytics}
          onRetry={loadSummary}
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
