import type { ReactNode } from "react";
import { SegmentedControl, type SegOption } from "./primitives";
import "./scoped-search-list.css";

/**
 * Reusable list chrome: an optional scope-tab row, a search box, an optional
 * toolbar action, a scrollable list body, and an empty state.
 *
 * Presentational by design. The CALLER owns its data, scope semantics, and
 * filtering (a prompt's scope field and a playbook's are different), then maps
 * its already-filtered items into `children`. This keeps the primitive decoupled
 * from any one data shape, so the prompt library (Agent 2) and the playbook
 * library (Agent 1) can both import it without sharing types.
 */
export interface ScopedSearchListProps<S extends string> {
  /** Scope tabs (e.g. All / Private / Shared / Org). Hidden when fewer than two. */
  scopes?: SegOption<S>[];
  activeScope?: S;
  onScope?: (scope: S) => void;
  /** Accessible name for the scope tablist. */
  scopeLabel?: string;
  /** Controlled search query. */
  query: string;
  onQuery: (query: string) => void;
  searchPlaceholder?: string;
  /** Toolbar action rendered next to the search box, e.g. a "New" button. */
  action?: ReactNode;
  /** Rendered in place of the list body when `isEmpty` is true. */
  empty?: ReactNode;
  /** Whether the caller's already-filtered list has no rows. */
  isEmpty?: boolean;
  /** The rendered rows (caller maps its filtered items). */
  children: ReactNode;
  /** Accessible name for the list region. */
  ariaLabel?: string;
}

function SearchGlyph() {
  return (
    <svg
      className="ssl__glyph"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function ScopedSearchList<S extends string>({
  scopes,
  activeScope,
  onScope,
  scopeLabel,
  query,
  onQuery,
  searchPlaceholder = "Search...",
  action,
  empty,
  isEmpty,
  children,
  ariaLabel,
}: ScopedSearchListProps<S>) {
  const showScopes = !!scopes && scopes.length > 1 && activeScope !== undefined && !!onScope;

  return (
    <div className="ssl">
      <div className="ssl__toolbar">
        <div className="ssl__search">
          <SearchGlyph />
          <input
            type="search"
            className="ssl__input"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => onQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="ssl__clear"
              aria-label="Clear search"
              onClick={() => onQuery("")}
            >
              &times;
            </button>
          )}
        </div>
        {action && <div className="ssl__action">{action}</div>}
      </div>

      {showScopes && (
        <SegmentedControl
          options={scopes}
          value={activeScope}
          onChange={onScope}
          label={scopeLabel ?? "Scope"}
        />
      )}

      <div className="ssl__list" role="list" aria-label={ariaLabel}>
        {isEmpty ? (
          <div className="ssl__empty">{empty ?? "Nothing here yet."}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
