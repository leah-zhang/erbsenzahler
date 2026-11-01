export function DataState({ state, label, onRetry }) {
  if (state?.loading) {
    return <div className="data-state" role="status" aria-busy="true">Loading {label}…</div>;
  }
  if (state?.error) {
    return (
      <div className="data-state data-state-error" role="alert">
        <p>Could not load {label}. Check that the backend is running, then try again.</p>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return null;
}
