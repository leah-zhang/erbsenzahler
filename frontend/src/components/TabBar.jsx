export function TabBar({ activeTab, onTabChange }) {
  return (
    <nav className="tab-bar" aria-label="Main sections">
      <button className={activeTab === 'import' ? 'active' : ''} type="button" onClick={() => onTabChange('import')}>
        Import
      </button>
      <button className={activeTab === 'categories' ? 'active' : ''} type="button" onClick={() => onTabChange('categories')}>
        Manage Spend Categories
      </button>
      <button className={activeTab === 'analytics' ? 'active' : ''} type="button" onClick={() => onTabChange('analytics')}>
        Spend Analytics
      </button>
      <button className={activeTab === 'accounts' ? 'active' : ''} type="button" onClick={() => onTabChange('accounts')}>
        Accounts
      </button>
    </nav>
  );
}
