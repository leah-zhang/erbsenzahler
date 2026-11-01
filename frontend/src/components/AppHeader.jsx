export function AppHeader({ onHome }) {
  return (
    <header className="app-header">
      <button className="app-brand" type="button" onClick={onHome} aria-label="Erbsenzahler home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 34">
            <g transform="translate(2.7 10) scale(.77)">
              <g transform="rotate(28 16 16)">
                <path d="M16 3C9 3 6 9 6 16c0 8 4 13 10 13 7 0 11-6 10-10-.5-3-5-3-5-6 0-3 3-5 1-8-1-1.5-4-2-6-2Z" />
                <path d="M18 11c-3 3-2 6 1 8" />
              </g>
            </g>
            <path d="M18 12c-1-3 0-6 2-8M18 9c-4 .5-6-1-6-4 4-.5 6 1 6 4M19 7c0-3 3-5 6-4 0 3-2 5-6 4" />
          </svg>
        </span>
        <span>erbsenzahler</span>
      </button>
      <div className="header-message">
        <h1>A little more clarity.</h1>
        <p>Understand your spending. Make room for what matters.</p>
      </div>
    </header>
  );
}
