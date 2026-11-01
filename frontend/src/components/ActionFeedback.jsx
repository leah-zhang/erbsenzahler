export function ActionFeedback({ feedback, onDismiss }) {
  if (!feedback?.message) return null;

  const { message, type = 'info' } = feedback;

  return (
    <div className={`action-feedback action-feedback-${type}`} role={type === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <div>
        <strong>{type === 'error' ? 'Something went wrong' : type === 'success' ? 'Success' : 'Status'}</strong>
        <p>{message}</p>
      </div>
      {onDismiss ? (
        <button type="button" className="feedback-dismiss" aria-label="Dismiss message" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
