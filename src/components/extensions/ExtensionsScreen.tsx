import React from "react";
import { useExtensionMounts } from "../../hooks/useExtensionMounts";
import { useHeadingFocus } from "../../hooks/useHeadingFocus";
import { searchCatalog } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import {
  availableUpdates,
  entryStatus,
  type getExtensionsState,
  loadExtensions,
  operationRunning,
  updateAll,
} from "../../lib/extensions";
import { Button } from "../ui/Button";
import { CheckStatusIndicator } from "../ui/CheckList";
import { ExtensionDetails } from "./ExtensionDetails";
import { ExtensionRow } from "./ExtensionRow";

import { ExtensionsToolbar, type Filters, type Tab } from "./ExtensionsToolbar";
import { RestartPanel } from "./RestartPanel";

const pageSize = 12;

interface IExtensionsScreenProps {
  onBack: () => void;
}

const ExtensionsScreen: React.FC<IExtensionsScreenProps> = ({ onBack }) => {
  const state = useExtensionMounts();
  const { headingRef } = useHeadingFocus();
  const [tab, setTab] = React.useState<Tab>("browse");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Filters>({
    query: "",
    category: "all",
    compatibleOnly: false,
  });
  const [limit, setLimit] = React.useState(pageSize);

  const { catalog, device } = state;
  const updates = availableUpdates(state);
  const installedIds = [...new Set(device.installed.map((entry) => entry.id))];
  const results = searchCatalog(catalog.entries, filters).filter(
    (entry) =>
      !filters.compatibleOnly || entryStatus(entry, state).compatibility?.compatible !== false,
  );
  const selectedEntry = catalog.entries.find((entry) => entry.id === selected);
  const loading = catalog.status === "loading" || catalog.status === "idle";

  return (
    <section className="w-full text-left" aria-labelledby="extensions-title">
      <ExtensionsToolbar
        state={state}
        selected={selected !== null}
        tab={tab}
        installedCount={installedIds.length}
        updateCount={updates.length}
        filters={filters}
        onFilterChange={(next) => {
          if (next.query !== filters.query || next.category !== filters.category)
            setLimit(pageSize);
          setFilters(next);
        }}
        onTabChange={(next) => {
          setTab(next);
          setSelected(null);
        }}
        onBack={selected ? () => setSelected(null) : onBack}
      />

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

        <RestartPanel state={state} />

        <div className="mt-5">
          {selected && selectedEntry ? (
            <ExtensionDetails state={state} entry={selectedEntry} onOpen={setSelected} />
          ) : loading ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-body" role="status">
              <CheckStatusIndicator status="checking" /> Loading the extension catalog…
            </p>
          ) : catalog.status === "error" ? (
            <div className="installer-well rounded-lg p-4 text-[13px]" role="alert">
              <p className="text-error">{catalog.error}</p>
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
  <ul className="installer-panel px-2 py-1">{children}</ul>
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
            <span title={device.info.revision ?? undefined} className="extension-chip">
              Development
            </span>
          )}
          {device.info.api && <span>· RVX API {device.info.api}</span>}
        </>
      ) : device.status === "loading" || device.status === "idle" ? (
        <>
          <CheckStatusIndicator status="checking" /> Looking for your iPod…
        </>
      ) : device.status === "absent" && state.eject.status === "ejected" ? (
        <>
          <CheckStatusIndicator status="skipped" /> iPod ejected
        </>
      ) : device.status === "absent" ? (
        <>
          <CheckStatusIndicator status="skipped" /> Mount your RepriseOS iPod to install extensions.
        </>
      ) : (
        <span className="text-error">{device.error}</span>
      )}
    </p>
  );
};

export { ExtensionsScreen };
