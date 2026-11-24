import type { PackageInfo } from "../lib/package";
import { Button } from "./ui/Button";
import { CheckStatusIndicator } from "./ui/CheckList";
import { HelpDisclosure } from "./ui/HelpDisclosure";

interface LocalPackagePickerProps {
  localPackage: PackageInfo | null;
  loading: "choose" | "prepare" | null;
  disabled: boolean;
  packageError: string;
  onChoose: () => void;
  onAutomatic: () => void;
}

export function LocalPackagePicker({
  localPackage,
  loading,
  disabled,
  packageError,
  onChoose,
  onAutomatic,
}: LocalPackagePickerProps) {
  return (
    <>
      {localPackage ? (
        <section
          aria-labelledby="package-title"
          className="installer-well mx-auto mt-5 max-w-125 rounded-lg p-4 text-left"
        >
          <h2 id="package-title" className="mb-3 text-[13px] font-medium text-ink">
            Local package
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1 basis-48 text-[13px] text-body" role="status">
              <p className="break-all">{localPackage.filename}</p>
              <p className="mt-1 text-[12px] text-muted">
                Version {localPackage.version} · Local package
              </p>
            </div>
            <Button.Root size="compact" disabled={disabled} onClick={onChoose}>
              <Button.Label>Change…</Button.Label>
            </Button.Root>
          </div>
          <button
            type="button"
            className="mt-2 cursor-pointer rounded-sm py-1 text-[12px] text-muted underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onAutomatic}
          >
            Use automatic download
          </button>
        </section>
      ) : (
        <HelpDisclosure label="Use a local package">
          <p>
            A local package isn’t needed. The latest compatible RepriseOS package downloads
            automatically when you continue. This option is intended for development and testing.
          </p>
          <Button.Root className="mt-3" size="compact" disabled={disabled} onClick={onChoose}>
            <Button.Label>Choose package…</Button.Label>
          </Button.Root>
        </HelpDisclosure>
      )}
      <div className="mx-auto max-w-125 text-left">
        <div role="status" aria-atomic="true">
          {loading && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-body">
              <CheckStatusIndicator status="checking" />
              {loading === "choose"
                ? "Loading local package…"
                : localPackage
                  ? "Preparing package…"
                  : "Downloading and verifying RepriseOS…"}
            </p>
          )}
        </div>
        <div role="alert" className="mt-3 text-[12px] leading-6 text-error empty:mt-0">
          {packageError}
        </div>
      </div>
    </>
  );
}
