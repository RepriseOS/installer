import type React from "react";
import { cn } from "../../lib/cn";
import { type ExtensionsState, ejectAndReboot, operationRunning } from "../../lib/extensions";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const StatusSymbol: React.FC<{ tone: "pending" | "failed" }> = ({ tone }) => (
  <svg className="size-9 shrink-0" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="16" fill={tone === "pending" ? "#bd8b3d" : "#b94137"} />
    {tone === "pending" ? (
      // Lucide rotate-cw (ISC).
      <svg
        aria-hidden="true"
        x="8"
        y="8"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    ) : (
      <path d="M18 10v10M18 25v.5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
    )}
  </svg>
);

const Panel: React.FC<{
  alert?: boolean;
  className?: string;
  symbol: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ alert, className, symbol, title, children, action }) => (
  <div
    role={alert ? "alert" : "status"}
    className={cn(
      "mt-4 flex flex-wrap items-center gap-x-5 gap-y-3.5 installer-panel px-5 py-[18px]",
      className,
    )}
  >
    {symbol}
    <div className="min-w-65 flex-1">
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {children}
    </div>
    {action}
  </div>
);

/** Restart guidance after extension changes, through eject and reboot. */
const RestartPanel: React.FC<{ state: ExtensionsState }> = ({ state }) => {
  const { eject, device } = state;

  if (eject.status === "ejecting") {
    return (
      <Panel
        symbol={
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Spinner className="size-7 text-ink" />
          </span>
        }
        title="Ejecting your iPod…"
        action={
          <Button.Root disabled>
            <Button.Label>Restart iPod</Button.Label>
          </Button.Root>
        }
      >
        <p className="mt-1 text-[13px] leading-[1.7] text-body">
          Keep it connected. It restarts as soon as the disk is safely ejected.
        </p>
      </Panel>
    );
  }

  if (!state.restartNeeded) return null;
  const canRestart = !!device.info?.ejectReboot;
  const disabled = operationRunning(state) || device.status !== "ready";

  if (eject.status === "failed") {
    return (
      <Panel
        alert
        className="items-start border-[#e2c1bc]"
        symbol={<StatusSymbol tone="failed" />}
        title="Couldn’t eject your iPod"
        action={
          <Button.Root disabled={disabled} onClick={() => void ejectAndReboot()}>
            <Button.Label>Try again</Button.Label>
          </Button.Root>
        }
      >
        <p className="mt-1 text-[13px] leading-[1.7] text-error">{eject.error}</p>
        <p className="mt-1.5 text-[13px] leading-[1.7] text-body">
          Close apps that use the iPod and try again. Or eject it yourself, then hold Menu and
          Select to restart. Your changes are already saved.
        </p>
      </Panel>
    );
  }

  const changes = Object.values(state.operations).filter(
    (operation) => operation.status === "done",
  ).length;

  return (
    <Panel
      symbol={<StatusSymbol tone="pending" />}
      title={
        changes
          ? `Restart your iPod to load ${changes} ${changes === 1 ? "change" : "changes"}`
          : "Restart your iPod to load your changes"
      }
      action={
        canRestart && (
          <Button.Root disabled={disabled} onClick={() => void ejectAndReboot()}>
            <Button.Label>Restart iPod</Button.Label>
          </Button.Root>
        )
      }
    >
      {!canRestart && (
        <p className="mt-1.5 text-[13px] leading-[1.7] text-body">
          Eject your iPod, then hold Menu and Select to restart.
        </p>
      )}
    </Panel>
  );
};

export { RestartPanel };
