/**
 * Inline help. Uses <details> so it works with no JavaScript, is keyboard
 * reachable, and is announced properly by screen readers.
 */
export default function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="hint">
      <summary aria-label={`What is ${label}?`}>
        <span aria-hidden="true">?</span>
      </summary>
      <div className="hint-body">
        <strong>{label}</strong>
        {children}
      </div>
    </details>
  );
}

/** A short "what this screen is for" block at the top of an admin area. */
export function AreaNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="area-note">
      <summary>
        <span className="area-note-icon" aria-hidden="true">?</span>
        How {title} works
      </summary>
      <div className="area-note-body">{children}</div>
    </details>
  );
}
