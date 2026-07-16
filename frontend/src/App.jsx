import { useEffect, useMemo, useState } from 'react';

import { api } from './api/client';
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

const categorizationPageSize = 10;

function App() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [status, setStatus] = useState('Ready to load statements');
  const [selectedFile, setSelectedFile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [isClearingTransactions, setIsClearingTransactions] = useState(false);
  const [isClearingCategories, setIsClearingCategories] = useState(false);
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationJobId, setAutomationJobId] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [columnMapping, setColumnMapping] = useState(emptyColumnMapping);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categorySummary, setCategorySummary] = useState([]);
  const [categoryEdits, setCategoryEdits] = useState({});
  const [categorizationGroups, setCategorizationGroups] = useState([]);
  const [categorizationPage, setCategorizationPage] = useState(0);
  const [categorizationTotal, setCategorizationTotal] = useState(0);
  const [categorizationHasMore, setCategorizationHasMore] = useState(false);
  const [customCategories, setCustomCategories] = useState({});

  const loadSummary = async () => {
    try {
      const response = await api.get('/analytics/monthly');
      setSummary(response.data);
    } catch (error) {
      setSummary(null);
    }
  };

  useEffect(() => {
    loadSummary();
    loadCategories();
    loadCategorySummary();
  }, []);

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

  const topCategoryCount = useMemo(() => {
    if (!summary?.top_categories?.length) {
      return 0;
    }

    return Math.max(...summary.top_categories.map((category) => category.count));
  }, [summary]);

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
    setColumnMapping(emptyColumnMapping);
    setCategorizationGroups([]);
    setCategorizationPage(0);
    setCategorizationTotal(0);
    setCategorizationHasMore(false);
    setCustomCategories({});

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

      setStatus(`Imported ${response.data.summary.rows} transactions from ${response.data.filename}.`);
      setSelectedFile(null);
      setCsvPreview([]);
      setCustomCategories({});
      await loadCategorizationSuggestions(0);
      await loadCategories();
      await loadCategorySummary();
      await loadSummary();
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Upload failed. Make sure the backend is running and the CSV has Date, Description, and Amount columns.';
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

  const handleApplyCategory = async (merchantKey, category) => {
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
      });
      setStatus(`Categorized ${response.data.updated_transactions} transactions as ${trimmedCategory}.`);
      setCustomCategories((current) => ({
        ...current,
        [merchantKey]: '',
      }));
      const nextPage = categorizationGroups.length <= 1 && categorizationPage > 0
        ? categorizationPage - 1
        : categorizationPage;
      await loadCategorizationSuggestions(nextPage);
      await loadCategories();
      await loadCategorySummary();
      await loadSummary();
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not apply the category. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleAutomation = async () => {
    setIsAutomating(true);
    setStatus('Starting browser automation...');

    try {
      const response = await api.post('/statements/download');
      setAutomationJobId(response.data.job_id || null);
      setStatus(response.data.message || 'Automation flow could not be started.');
    } catch (error) {
      const detail = error?.response?.data?.message || error?.message || 'Automation flow could not be started.';
      setStatus(detail);
    } finally {
      setIsAutomating(false);
    }
  };

  const handleAutomationContinue = async () => {
    if (!automationJobId) {
      setStatus('Start the download flow before continuing automation.');
      return;
    }

    setIsAutomating(true);
    setStatus('Continuing browser automation...');

    try {
      const response = await api.post(`/statements/download/${automationJobId}/continue`);
      setStatus(response.data.message || 'Automation flow continued.');
      setAutomationJobId(null);
    } catch (error) {
      const detail = error?.response?.data?.message || error?.message || 'Automation flow could not continue.';
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
      setCategoryEdits({});
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
      setCategoryEdits({});
      await loadCategorizationSuggestions(0);
      await loadSummary();
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not clear categories. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsClearingCategories(false);
    }
  };

  const totalMonths = summary?.monthly_breakdown?.length || 0;
  const totalCategories = summary?.top_categories?.length || 0;
  const handleCategorizationPageChange = (nextPage) => {
    loadCategorizationSuggestions(nextPage);
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
      await loadCategories();
      await loadCategorySummary();
      await loadSummary();
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Could not rename the category. Make sure the backend is running.';
      setStatus(detail);
    } finally {
      setIsRenamingCategory(false);
    }
  };

  return (
    <main className="app-shell">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'import' ? (
        <ImportTab
          automationJobId={automationJobId}
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
          isAutomating={isAutomating}
          isCategorizing={isCategorizing}
          isClearingCategories={isClearingCategories}
          isClearingTransactions={isClearingTransactions}
          isUploading={isUploading}
          onAutomation={handleAutomation}
          onAutomationContinue={handleAutomationContinue}
          onApplyCategory={handleApplyCategory}
          onCategorizationPageChange={handleCategorizationPageChange}
          onClearCategories={handleClearCategories}
          onClearTransactions={handleClearTransactions}
          onCustomCategoryChange={handleCustomCategoryChange}
          onFileChange={handleFileChange}
          onHeaderChange={setHasHeader}
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
          categoryEdits={categoryEdits}
          isRenamingCategory={isRenamingCategory}
          onCategoryEditChange={handleCategoryEditChange}
          onRenameCategory={handleRenameCategory}
        />
      ) : (
        <AnalyticsTab
          summary={summary}
          topCategoryCount={topCategoryCount}
          totalCategories={totalCategories}
          totalMonths={totalMonths}
        />
      )}
    </main>
  );
}

export default App;
