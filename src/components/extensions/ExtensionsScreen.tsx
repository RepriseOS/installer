import React from "react";
import { useHeadingFocus } from "../../hooks/useHeadingFocus";
import { type Category, categoryLabels, searchCatalog } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import {
  availableUpdates,
  entryStatus,
  getExtensionsState,
  loadExtensions,
  operationRunning,
  subscribeToExtensions,
  updateAll,
} from "../../lib/extensions";
import { Button } from "../ui/Button";
import { CheckStatusIndicator } from "../ui/CheckList";
import { ExtensionDetails } from "./ExtensionDetails";
import { ExtensionRow } from "./ExtensionRow";

type Tab = "browse" | "installed" | "updates";
const pageSize = 12;

interface IExtensionsScreenProps {
  onBack: () => void;
}

const ExtensionsScreen: React.FC<IExtensionsScreenProps> = ({ onBack }) => {
  const state = React.useSyncExternalStore(subscribeToExtensions, getExtensionsState);
  const { headingRef } = useHeadingFocus();
  const [tab, setTab] = React.useState<Tab>("browse");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<Category | "all">("all");
  const [compatibleOnly, setCompatibleOnly] = React.useState(false);
  const [limit, setLimit] = React.useState(pageSize);

  React.useEffect(() => {
    void loadExtensions();
  }, []);

  const { catalog, device } = state;
  const updates = availableUpdates(state);
  const installedIds = [...new Set(device.installed.map((entry) => entry.id))];
  const categories = [
    ...new Set(
      catalog.entries.map((entry) => entry.category).filter((value) => value !== "library"),
    ),
  ].sort();
  const results = searchCatalog(catalog.entries, { query, category }).filter(
    (entry) => !compatibleOnly || entryStatus(entry, state).compatibility?.compatible !== false,
  );
  const selectedEntry = catalog.entries.find((entry) => entry.id === selected);
  const loading = catalog.status === "loading" || catalog.status === "idle";

  const tabs: { id: Tab; label: string; count?: number; badge?: boolean }[] = [
    { id: "browse", label: "Browse" },
    { id: "installed", label: "Installed", count: installedIds.length },
    { id: "updates", label: "Updates", count: updates.length, badge: updates.length > 0 },
  ];

  return (
    <section className="w-full text-left" aria-labelledby="extensions-title">
      <div className="sticky top-0 z-10 -mx-6 -mt-14 border-b border-[#dedbd5] bg-[#efeeebf0] px-6 pt-5 pb-4 backdrop-blur-md sm:-mx-12 sm:px-12">
        <div className="mx-auto flex max-w-220 flex-wrap items-center justify-between gap-3">
          <Button.Root
            size="compact"
            className="h-9 pr-3.5 pl-2.5"
            onClick={selected ? () => setSelected(null) : onBack}
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
                onClick={() => {
                  setTab(item.id);
                  setSelected(null);
                }}
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
                  setQuery(event.target.value);
                  setLimit(pageSize);
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
                    setCategory(event.target.value as Category | "all");
                    setLimit(pageSize);
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
                onChange={(event) => setCompatibleOnly(event.target.checked)}
                className="accent-[#3e89c5]"
              />
              Compatible only
            </label>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-220 pt-7">
        <h1
          id="extensions-title"
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            "text-[32px] leading-tight font-bold tracking-[-0.045em] outline-none",
            selected && "sr-only",
          )}
        >
          {tab === "browse" ? "Extensions" : tab === "installed" ? "Installed" : "Updates"}
        </h1>

        <DeviceLine state={state} />

        {state.restartNeeded && (
          <div
            className="installer-well mt-4 flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] leading-6 text-body"
            role="status"
          >
            <svg className="size-[18px] shrink-0" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="9" fill="#bd8b3d" />
              <path d="M10 5.5V11M10 14v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p>
              <strong className="text-ink">Restart needed.</strong> Eject your iPod, then hold Menu
              and Select to load your changes.
            </p>
          </div>
        )}

        <div className="mt-5">
          {selected && selectedEntry ? (
            <ExtensionDetails state={state} entry={selectedEntry} onOpen={setSelected} />
          ) : loading ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-body" role="status">
              <CheckStatusIndicator status="checking" /> Loading the extension catalog…
            </p>
          ) : catalog.status === "error" ? (
            <div className="installer-well rounded-lg p-4 text-[13px]" role="alert">
              <p className="text-[#aa3e36]">{catalog.error}</p>
              <p className="mt-1 text-body">Check your internet connection and try again.</p>
              <Button.Root size="compact" className="mt-3" onClick={() => void loadExtensions()}>
                <Button.Label>Try again</Button.Label>
              </Button.Root>
            </div>
          ) : tab === "browse" ? (
            catalog.entries.length === 0 ? (
              <p className="py-6 text-[13px] text-body">No extensions are listed yet.</p>
            ) : (
              <>
                <p className="mb-2.5 text-[12px] text-body">
                  {results.length} {results.length === 1 ? "extension" : "extensions"}
                  {results.length > limit && ` · Showing ${limit}`}
                </p>
                {results.length === 0 ? (
                  <p className="py-4 text-[13px] text-body">No extensions match your search.</p>
                ) : (
                  <List>
                    {results.slice(0, limit).map((entry) => (
                      <ExtensionRow
                        key={entry.id}
                        state={state}
                        entry={entry}
                        mode="browse"
                        onOpen={() => setSelected(entry.id)}
                      />
                    ))}
                  </List>
                )}
                {results.length > limit && (
                  <div className="mt-5 flex justify-center">
                    <Button.Root onClick={() => setLimit(limit + pageSize)}>
                      <Button.Label>
                        Show {Math.min(pageSize, results.length - limit)} more
                      </Button.Label>
                    </Button.Root>
                  </div>
                )}
              </>
            )
          ) : tab === "installed" ? (
            installedIds.length === 0 ? (
              <p className="py-6 text-[13px] text-body">
                {device.status === "ready" ? "No extensions are installed." : ""}
              </p>
            ) : (
              <List>
                {installedIds.map((id) => {
                  const entry = catalog.entries.find((item) => item.id === id);
                  return (
                    <ExtensionRow
                      key={id}
                      state={state}
                      entry={entry}
                      copies={device.installed.filter((copy) => copy.id === id)}
                      mode="installed"
                      onOpen={entry ? () => setSelected(id) : undefined}
                    />
                  );
                })}
              </List>
            )
          ) : updates.length === 0 ? (
            <p className="py-6 text-[13px] text-body">
              {device.status === "ready" ? "Everything is up to date." : ""}
            </p>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <Button.Root
                  size="compact"
                  disabled={operationRunning(state)}
                  onClick={() => void updateAll()}
                >
                  <Button.Label>Update all</Button.Label>
                </Button.Root>
              </div>
              <List>
                {updates.map((entry) => (
                  <ExtensionRow
                    key={entry.id}
                    state={state}
                    entry={entry}
                    mode="browse"
                    onOpen={() => setSelected(entry.id)}
                  />
                ))}
              </List>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

const List: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="rounded-2xl border border-[#d4d1cb] bg-[#f8f7f4]/90 px-2 py-1 shadow-[inset_0_1px_0_#ffffff,0_2px_8px_#3a332b08]">
    {children}
  </ul>
);

const DeviceLine: React.FC<{ state: ReturnType<typeof getExtensionsState> }> = ({ state }) => {
  const { device } = state;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-body">
      {device.status === "ready" && device.info ? (
        <>
          <CheckStatusIndicator status="passed" />
          <span>
            <strong className="font-bold text-ink">{device.info.model}</strong> · RepriseOS
            {device.info.repriseos !== "Development" && ` ${device.info.repriseos}`}
          </span>
          {device.info.repriseos === "Development" && (
            <span
              title={device.info.revision ?? undefined}
              className="rounded-full border border-[#d7c39c] bg-[#f8efdf] px-2 text-[10.5px] text-[#7a5a24]"
            >
              Development
            </span>
          )}
          {device.info.api && <span>· RVX API {device.info.api}</span>}
        </>
      ) : device.status === "loading" || device.status === "idle" ? (
        <>
          <CheckStatusIndicator status="checking" /> Looking for your iPod…
        </>
      ) : device.status === "absent" ? (
        <>
          <CheckStatusIndicator status="skipped" /> Mount your RepriseOS iPod to install extensions.
        </>
      ) : (
        <span className="text-[#aa3e36]">{device.error}</span>
      )}
    </p>
  );
};

export { ExtensionsScreen };
