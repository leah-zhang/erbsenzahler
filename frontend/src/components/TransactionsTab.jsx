import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatCurrency } from '../utils/currency';
import { ActionFeedback } from './ActionFeedback';
import { DataState } from './DataState';

const emptyFilters = { search: '', category: '', account: '', source: '', date_from: '', date_to: '' };
const pageSize = 25;

export function TransactionsTab({ onChanged, feedback, onFeedback, onDismissFeedback }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState({ transactions: [], total: 0, categories: [], accounts: [], sources: [] });
  const [loadState, setLoadState] = useState({ loading: true });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoadState({ loading: true });
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get('/transactions', {
          params: { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), limit: pageSize, offset: page * pageSize },
          signal: controller.signal,
        });
        if (id !== requestId.current) return;
        if (!response.data.transactions.length && response.data.total && page > 0) {
          setPage(Math.max(0, Math.ceil(response.data.total / pageSize) - 1));
          return;
        }
        setData(response.data);
        setLoadState({ loading: false });
      } catch {
        if (!controller.signal.aborted && id === requestId.current) setLoadState({ loading: false, error: true });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, page, version]);

  const changeFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  };
  const updateEdit = (key, value) => setEditing((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (!editing || saving) return;
    if (!String(editing.amount).trim() || !Number.isFinite(Number(editing.amount))) {
      onFeedback({ type: 'error', message: 'Enter a valid amount.' });
      return;
    }
    setSaving(true);
    onDismissFeedback();
    try {
      await api.patch(`/transactions/${editing.id}`, {
        date: editing.date, description: editing.description.trim(), amount: Number(editing.amount),
        category: editing.category.trim(), account: editing.account.trim(),
      });
      onFeedback({ type: 'success', message: 'Transaction saved. Spending totals and categories have been updated.' });
      setEditing(null);
      setVersion((current) => current + 1);
      onChanged();
    } catch (error) {
      const detail = error?.response?.data?.detail;
      onFeedback({ type: 'error', message: typeof detail === 'string' ? detail : 'Could not save this transaction. Check the values and try again.' });
    } finally { setSaving(false); }
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <section className="transactions-page">
      <div className="tab-feedback"><ActionFeedback feedback={feedback} onDismiss={onDismissFeedback} /></div>
      <article className="insight-panel">
        <div className="panel-heading">
          <p className="eyebrow">Transactions</p>
          <h2>Review transactions</h2>
          <small>Search imported spending and payments. Editing a category here changes only this transaction.</small>
        </div>
        <div className="transaction-filters">
          <label>Search<input type="search" placeholder="Merchant, account, category, or file" value={filters.search} disabled={saving} onChange={(e) => changeFilter('search', e.target.value)} /></label>
          <label>Category<select value={filters.category} disabled={saving} onChange={(e) => changeFilter('category', e.target.value)}><option value="">All categories</option>{data.categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Account<select value={filters.account} disabled={saving} onChange={(e) => changeFilter('account', e.target.value)}><option value="">All accounts</option>{data.accounts.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Source file<select value={filters.source} disabled={saving} onChange={(e) => changeFilter('source', e.target.value)}><option value="">All files</option><option value="unknown">Source unavailable</option>{data.sources.map((source) => <option value={source.id} key={source.id}>{source.filename} - {new Date(source.uploaded_at).toLocaleString()}</option>)}</select></label>
          <label>From<input type="date" value={filters.date_from} max={filters.date_to || undefined} disabled={saving} onChange={(e) => changeFilter('date_from', e.target.value)} /></label>
          <label>To<input type="date" value={filters.date_to} min={filters.date_from || undefined} disabled={saving} onChange={(e) => changeFilter('date_to', e.target.value)} /></label>
          <button type="button" disabled={!filtered || saving} onClick={() => { setFilters(emptyFilters); setPage(0); }}>Clear filters</button>
        </div>
        {editing ? (
          <form className="transaction-editor" onSubmit={save}>
            <h3>Edit transaction</h3>
            <div className="transaction-filters">
              <label>Date<input autoFocus type="date" required value={editing.date} disabled={saving} onChange={(e) => updateEdit('date', e.target.value)} /></label>
              <label>Merchant / description<input required value={editing.description} disabled={saving} onChange={(e) => updateEdit('description', e.target.value)} /></label>
              <label>Amount<input type="number" step="0.01" required value={editing.amount} disabled={saving} onChange={(e) => updateEdit('amount', e.target.value)} /></label>
              <label>Category<input required list="transaction-categories" value={editing.category} disabled={saving} onChange={(e) => updateEdit('category', e.target.value)} /></label>
              <label>Account<input required list="transaction-accounts" value={editing.account} disabled={saving} onChange={(e) => updateEdit('account', e.target.value)} /></label>
            </div>
            <datalist id="transaction-categories">{data.categories.map((value) => <option value={value} key={value} />)}</datalist>
            <datalist id="transaction-accounts">{data.accounts.map((value) => <option value={value} key={value} />)}</datalist>
            <p>Positive amounts are spending; negative amounts are payments or credits.</p>
            <div className="category-actions"><button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save transaction'}</button><button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        ) : null}
        {loadState.loading || loadState.error ? <DataState state={loadState} label="transactions" onRetry={() => setVersion((current) => current + 1)} /> : data.transactions.length ? (
          <>
            <p>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.total)} of {data.total} transactions</p>
            <div className="transaction-table-wrap">
              <table className="transaction-table">
                <thead><tr><th>Date</th><th>Merchant / description</th><th>Amount</th><th>Category</th><th>Account</th><th>Source file</th><th>Actions</th></tr></thead>
                <tbody>{data.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.date}</td><td>{transaction.description}</td><td>{formatCurrency(transaction.amount)}</td><td>{transaction.category}</td><td>{transaction.account}</td><td>{transaction.source_file || 'Source unavailable'}</td>
                    <td><button type="button" disabled={saving || Boolean(editing)} aria-label={`Edit ${transaction.description} on ${transaction.date}`} onClick={() => { setEditing({ ...transaction }); onDismissFeedback(); }}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="pagination-controls"><button type="button" disabled={!page || saving} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button type="button" disabled={!data.has_more || saving} onClick={() => setPage(page + 1)}>Next</button></div>
          </>
        ) : <p className="empty-state">{filtered ? 'No transactions match these filters.' : 'No transactions yet. Import a statement to get started.'}</p>}
        <small>Source files are tracked for new imports. Older transactions may have no source information.</small>
      </article>
    </section>
  );
}
