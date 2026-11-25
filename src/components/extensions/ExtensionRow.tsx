import type React from "react";
import type { CatalogEntry } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import type { InstalledExtension } from "../../lib/extensionDevice";
import {
  type ExtensionsState,
  entryStatus,
  installExtension,
  installedCompatibility,
  operationRunning,
  removeExtension,
} from "../../lib/extensions";
import { Button } from "../ui/Button";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { ExternalLink } from "../ui/ExternalLink";
import { useExtensionOperation } from "./OperationStatus";
import { StabilityChip } from "./StabilityChip";

interface IExtensionRowProps {
  state: ExtensionsState;
  entry?: CatalogEntry;
  /** Copies on the iPod, for extensions shown in the Installed list. */
  copies?: InstalledExtension[];
  mode: "browse" | "installed";
  onOpen?: () => void;
}

const ExtensionRow: React.FC<IExtensionRowProps> = ({ state, entry, copies, mode, onOpen }) => {
  const id = entry?.id ?? copies?.[0]?.id ?? "";
  const { indicator, steps } = useExtensionOperation(id, state.operations[id], "pb-3 pl-[66px]");
  const status = entry ? entryStatus(entry, state) : null;
  const busy = operationRunning(state);
  const deviceReady = state.device.status === "ready";
  const legacy = copies?.some((copy) => copy.folder === "/Revola/Extensions/");

  // An installed copy is judged by its own manifest, the catalog version only for installing.
  const problem = status
    ? status.installed
      ? status.installedCompatibility
      : status.compatibility
    : installedCompatibility(id, state);
  const compatible = !status?.compatibility || status.compatibility.compatible;
  const update = !!status?.updateAvailable && compatible;

  const version = status?.installed ?? copies?.[0]?.version ?? entry?.version;
  const versionText = entry
    ? update
      ? `${status?.installed} → ${entry.version}`
      : (version ?? "")
    : `${version} · Not in the catalog`;

  let label: { text: string; tone: "ok" | "update" | "warn" } | null = null;
  if (problem && !problem.compatible) {
    label = { text: problem.reason, tone: "warn" };
  } else if (update) {
    label = { text: "Update available", tone: "update" };
  } else if (status?.installed) {
    label = { text: "Installed", tone: "ok" };
  } else if (status?.compatibility?.compatible && status.compatibility.warning) {
    label = { text: status.compatibility.warning, tone: "warn" };
  } else if (status?.compatibility) {
    label = { text: "Compatible", tone: "ok" };
  }

  const action = update
    ? "update"
    : mode === "installed"
      ? "remove"
      : (!status?.installed && compatible) || status?.canReplace
        ? "install"
        : null;

  return (
    <li className="border-t border-[#e2dfda] first:border-t-0">
      <div className="flex items-center gap-3.5 rounded-[10px] px-2.5 py-3">
        <ExtensionIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {onOpen ? (
              <button
                type="button"
                className="cursor-pointer rounded-sm text-[14px] font-bold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus/50"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
              >
                {entry?.name ?? copies?.[0]?.name}
              </button>
            ) : (
              <span className="text-[14px] font-bold">{entry?.name ?? copies?.[0]?.name}</span>
            )}
            <span className="text-[12px] text-body">{versionText}</span>
            {entry?.stability && <StabilityChip stability={entry.stability} />}
            {legacy && <span className="extension-chip">In /Revola/Extensions/</span>}
          </p>
          {entry && (
            <>
              <p className="mt-0.5 truncate text-[12px] leading-5 text-body">{entry.description}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-body">
                <span>{entry.author_handle ? `@${entry.author_handle}` : entry.author}</span>
                <ExternalLink href={`https://github.com/${entry.repo}`}>{entry.repo}</ExternalLink>
              </p>
            </>
          )}
        </div>
        {indicator ??
          (mode === "browse" && problem?.compatible === false && !action ? (
            <span className="shrink-0 whitespace-nowrap text-[12px] text-body">
              {problem.summary}
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              {label && (
                <span
                  className={cn(
                    "flex max-w-44 items-center gap-1.5 text-right text-[12px]",
                    label.tone === "ok" && "text-[#4c7a50]",
                    label.tone === "update" && "text-[#2f6ea3]",
                    label.tone === "warn" && "text-[#7a5a24]",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      label.tone === "ok" && "bg-[#609064]",
                      label.tone === "update" && "bg-[#3e89c5]",
                      label.tone === "warn" && "bg-[#bd8b3d]",
                    )}
                  />
                  {label.text}
                </span>
              )}
              {action && (
                <Button.Root
                  size="compact"
                  className="h-8 min-w-20 px-3.5 text-[12px]"
                  disabled={busy || !deviceReady}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (action === "remove") void removeExtension(id);
                    else void installExtension(id);
                  }}
                >
                  <Button.Label>
                    {action === "install" ? "Install" : action === "update" ? "Update" : "Remove"}
                  </Button.Label>
                </Button.Root>
              )}
            </div>
          ))}
      </div>
      {steps}
    </li>
  );
};

export { ExtensionRow };
