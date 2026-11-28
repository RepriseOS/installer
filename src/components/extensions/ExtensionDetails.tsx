import type React from "react";
import {
  type CatalogEntry,
  categoryLabels,
  extensionFolder,
  formatSize,
  sourceUrl,
} from "../../lib/catalog";
import {
  type ExtensionsState,
  entryStatus,
  installExtension,
  operationRunning,
  removeExtension,
} from "../../lib/extensions";
import { Button } from "../ui/Button";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { ExternalLink } from "../ui/ExternalLink";
import { useExtensionOperation } from "./OperationStatus";
import { ScreenshotCarousel } from "./ScreenshotCarousel";
import { StabilityChip } from "./StabilityChip";

interface IExtensionDetailsProps {
  state: ExtensionsState;
  entry: CatalogEntry;
  onOpen: (id: string) => void;
}

const ExtensionDetails: React.FC<IExtensionDetailsProps> = ({ state, entry, onOpen }) => {
  const status = entryStatus(entry, state);
  const { indicator, steps } = useExtensionOperation(
    entry.id,
    state.operations[entry.id],
    "mt-3 ml-auto max-w-105",
  );
  const busy = operationRunning(state);
  const deviceReady = state.device.status === "ready";
  const compatible = !status.compatibility || status.compatibility.compatible;
  const copy = status.installedCompatibility;
  let note = formatSize(entry.package.size);
  if (copy && !copy.compatible) {
    note = copy.reason;
  } else if (status.updateAvailable && status.compatibility && !status.compatibility.compatible) {
    const { reason } = status.compatibility;
    note = `Version ${entry.version} ${reason[0].toLowerCase()}${reason.slice(1)}`;
  } else if (status.installed) {
    note = `Version ${status.installed} installed`;
  } else if (status.compatibility && !status.compatibility.compatible) {
    note = status.compatibility.reason;
  }
  const requires = entry.requires.map(
    (id) => state.catalog.entries.find((item) => item.id === id) ?? { id, name: id },
  );
  const released =
    entry.release &&
    new Date(entry.release.published_at).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <article className="text-left" aria-labelledby="extension-title">
      <div className="flex flex-wrap items-center gap-5">
        <ExtensionIcon entry={entry} size={72} />
        <div className="min-w-55 flex-1">
          <h2
            id="extension-title"
            className="flex flex-wrap items-center gap-3 text-[32px] leading-tight font-bold tracking-[-0.045em]"
          >
            {entry.name}
            {entry.stability && <StabilityChip stability={entry.stability} />}
          </h2>
          <p className="mt-1 text-[13px] text-body">
            by{" "}
            {entry.author_handle ? (
              <ExternalLink href={`https://github.com/${entry.author_handle}`}>
                {entry.author} (@{entry.author_handle})
              </ExternalLink>
            ) : (
              entry.author
            )}{" "}
            · Version {entry.version}
          </p>
          {entry.note && <p className="mt-0.5 text-[12px] text-body">{entry.note}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {!indicator && (
            <div className="flex gap-2">
              {status.installed && (
                <Button.Root
                  disabled={busy || !deviceReady}
                  onClick={() => void removeExtension(entry.id)}
                >
                  <Button.Label>Remove</Button.Label>
                </Button.Root>
              )}
              {(!status.installed || status.updateAvailable || status.canReplace) && (
                <Button.Root
                  disabled={busy || !deviceReady || !compatible}
                  onClick={() => void installExtension(entry.id)}
                >
                  <Button.Label>{status.updateAvailable ? "Update" : "Install"}</Button.Label>
                </Button.Root>
              )}
            </div>
          )}
          {indicator ?? <p className="text-[12px] text-body">{note}</p>}
        </div>
      </div>
      {steps}

      <div className="mt-8 flex flex-wrap gap-8">
        <div className="min-w-0 flex-[999_1_360px]">
          <p className="text-[15px] leading-[1.85] text-body">{entry.description}</p>
          <p className="mt-3 text-[13px] leading-[1.85] text-body">{entry.details}</p>
          <ScreenshotCarousel key={entry.id} screenshots={entry.screenshots} />
        </div>
        <aside className="min-w-0 flex-[1_1_240px]">
          <dl className="installer-well grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 rounded-lg p-4 text-[12px]">
            <dt className="text-body">Category</dt>
            <dd>{categoryLabels[entry.category]}</dd>
            {entry.min_repriseos && (
              <>
                <dt className="text-body">Works with</dt>
                <dd>RepriseOS {entry.min_repriseos} or later</dd>
              </>
            )}
            {entry.models?.length ? (
              <>
                <dt className="text-body">iPods</dt>
                <dd>{entry.models.join(", ")}</dd>
              </>
            ) : null}
            {requires.length > 0 && (
              <>
                <dt className="text-body">Requires</dt>
                <dd className="flex flex-wrap gap-x-1.5">
                  {requires.map((library, index) => (
                    <span key={library.id}>
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm underline decoration-[#b9b5ae] underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/50"
                        onClick={() => onOpen(library.id)}
                      >
                        {library.name}
                      </button>
                      {index < requires.length - 1 && ","}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-body">Size</dt>
            <dd>{formatSize(entry.package.size)}</dd>
            <dt className="text-body">Installs to</dt>
            <dd className="font-mono text-[11.5px] break-all">{extensionFolder}</dd>
            <dt className="text-body">Source</dt>
            <dd className="break-all">
              <ExternalLink href={sourceUrl(entry)}>{entry.repo}</ExternalLink>
            </dd>
            {entry.release && (
              <>
                <dt className="text-body">Release</dt>
                <dd>
                  <ExternalLink href={entry.release.url}>{entry.release.tag}</ExternalLink>
                  {released && <span className="text-body"> · {released}</span>}
                </dd>
              </>
            )}
            <dt className="text-body">License</dt>
            <dd>{entry.license}</dd>
          </dl>
          <p className="mt-3 text-[12px] leading-[1.8] text-body">
            <ExternalLink
              href={`https://github.com/RepriseOS/repriseos-extensions/issues/new?title=${encodeURIComponent(`${entry.name} ${entry.version}: `)}`}
            >
              Report a problem
            </ExternalLink>
          </p>
        </aside>
      </div>
    </article>
  );
};

export { ExtensionDetails };
