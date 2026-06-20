import type { ReactNode } from 'react';

/**
 * A highlighted key term. Uses a subtle amber style plus font-weight so the
 * emphasis does not rely on color alone (accessibility), and a title attribute
 * for hover context. Rendered as inline text — semantics are preserved.
 */
export function KeyTerm({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded bg-yellow-400/10 px-1 font-medium text-yellow-200"
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </span>
  );
}
