import { type Category, categoryLabels } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import { type ExtensionsState, loadExtensions, operationRunning } from "../../lib/extensions";
import { Button } from "../ui/Button";

export type Tab = "browse" | "installed" | "updates";
export interface Filters {
  query: string;
  category: Category | "all";
  compatibleOnly: boolean;
}

interface ExtensionsToolbarProps {
  state: ExtensionsState;
  selected: boolean;
  tab: Tab;
  installedCount: number;
  updateCount: number;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onTabChange: (tab: Tab) => void;
  onBack: () => void;
}

export function ExtensionsToolbar({
  state,
  selected,
  tab,
  installedCount,
  updateCount,
  filters,
  onFilterChange,
  onTabChange,
  onBack,
}: ExtensionsToolbarProps) {
  const { catalog } = state;
  const { query, category, compatibleOnly } = filters;
  const loading = catalog.status === "loading" || catalog.status === "idle";
  const categories = [
    ...new Set(
      catalog.entries.map((entry) => entry.category).filter((value) => value !== "library"),
    ),
  ].sort();
  const tabs: { id: Tab; label: string; count?: number; badge?: boolean }[] = [
    { id: "browse", label: "Browse" },
    { id: "installed", label: "Installed", count: installedCount },
    { id: "updates", label: "Updates", count: updateCount, badge: updateCount > 0 },
  ];

  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-14 border-b border-[#dedbd5] bg-[#efeeebf0] px-6 pt-5 pb-4 backdrop-blur-md sm:-mx-12 sm:px-12">
      <div className="mx-auto flex max-w-220 flex-wrap items-center justify-between gap-3">
        <Button.Root
          size="compact"
          className="h-9 pr-3.5 pl-2.5"
          disabled={state.eject.status === "ejecting"}
          onClick={onBack}
        >
          <Button.Label className="flex items-center gap-1.5">
            <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="m12 5-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {selected ? "Extensions" : "RepriseOS"}
          </Button.Label>
        </Button.Root>
        <nav
          aria-label="Extensions"
          className="installer-well flex gap-0.5 rounded-[10px] p-[3px] text-[13px]"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={!selected && tab === item.id ? "page" : undefined}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-[7px] px-4 py-1.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-focus/50",
                !selected &&
                  tab === item.id &&
                  "glass-button-neutral font-bold text-ink shadow-[inset_0_1px_0_#fff,0_1px_2px_#29241c1f]",
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-full bg-[#3e89c5] px-1.5 text-[10.5px] font-bold text-white">
                  {item.count}
                </span>
              ) : item.count ? (
                <span className="font-normal text-muted">{item.count}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <Button.Root
          size="compact"
          className="h-9"
          disabled={loading || operationRunning(state)}
          onClick={() => void loadExtensions()}
        >
          <Button.Label>Refresh</Button.Label>
        </Button.Root>
      </div>
      {!selected && tab === "browse" && catalog.entries.length > 0 && (
        <div className="mx-auto mt-3.5 flex max-w-220 flex-wrap items-center gap-x-4 gap-y-2.5">
          <label className="installer-well flex h-9 min-w-55 flex-1 items-center gap-2 rounded-[10px] px-3 focus-within:ring-2 focus-within:ring-focus/50">
            <svg className="size-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="#5b5955" strokeWidth="1.6" />
              <path
                d="m13.2 13.2 3.3 3.3"
                stroke="#5b5955"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">Search extensions</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                onFilterChange({ ...filters, query: event.target.value });
              }}
              placeholder="Search by name, author or repo"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-[#6e6a64]"
            />
          </label>
          {categories.length > 1 && (
            <label className="flex items-center gap-2 text-[12px] text-body">
              Category
              <select
                value={category}
                onChange={(event) => {
                  onFilterChange({
                    ...filters,
                    category: event.target.value as Filters["category"],
                  });
                }}
                className="glass-button-neutral h-8 rounded-lg border border-[#c2bfba] px-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
              >
                <option value="all">All</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-body">
            <input
              type="checkbox"
              checked={compatibleOnly}
              onChange={(event) =>
                onFilterChange({ ...filters, compatibleOnly: event.target.checked })
              }
              className="accent-[#3e89c5]"
            />
            Compatible only
          </label>
        </div>
      )}
    </div>
  );
}
