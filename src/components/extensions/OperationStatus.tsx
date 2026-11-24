import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React from "react";
import { cn } from "../../lib/cn";
import { dismissOperation, type Operation } from "../../lib/extensions";
import { Button } from "../ui/Button";
import { CheckStatusIndicator } from "../ui/CheckList";

const verbs = {
  install: "Installing",
  update: "Updating",
  remove: "Removing",
} as const;

interface IOperationStatusProps {
  operation: Operation;
  expanded: boolean;
  onToggle: () => void;
  controls: string;
}

const OperationStatus: React.FC<IOperationStatusProps> = ({
  operation,
  expanded,
  onToggle,
  controls,
}) => {
  if (operation.status === "running") {
    return (
      <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-body">
        <CheckStatusIndicator status="checking" />
        {verbs[operation.kind]}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded text-xs text-[#aa3e36] hover:underline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <CheckStatusIndicator status="failed" />
      <span role="status">Failed</span>
      <svg
        className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-180")}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m6 8 4 4 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

interface IOperationStepsProps {
  id: string;
  operationId: string;
  operation: Operation;
  expanded: boolean;
  onRetry?: () => void;
  className?: string;
}

const OperationSteps: React.FC<IOperationStepsProps> = ({
  id,
  operationId,
  operation,
  expanded,
  onRetry,
  className,
}) => {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
          className={cn("overflow-hidden", className)}
        >
          <div className="installer-well rounded-lg px-3 py-2 text-left">
            <ul className="space-y-0.5">
              {operation.steps.map((step) => (
                <li
                  key={step.label}
                  className={cn(
                    "flex min-h-7 items-center gap-2.5 text-[12px]",
                    step.status === "pending" && "text-muted",
                    step.status === "failed" && "text-[#aa3e36]",
                  )}
                >
                  <CheckStatusIndicator status={step.status} />
                  <span className="min-w-0 flex-1">{step.label}</span>
                  {step.detail && <span className="shrink-0 text-muted">{step.detail}</span>}
                </li>
              ))}
            </ul>
            {operation.error && (
              <p className="mt-1.5 text-[12px] leading-5 text-[#aa3e36]">{operation.error}</p>
            )}
            {operation.status === "failed" && (
              <div className="mt-2 flex gap-2 pb-1">
                {onRetry && (
                  <Button.Root size="compact" className="h-8 text-[12px]" onClick={onRetry}>
                    <Button.Label>Try again</Button.Label>
                  </Button.Root>
                )}
                <Button.Root
                  size="compact"
                  className="h-8 text-[12px]"
                  onClick={() => dismissOperation(operationId)}
                >
                  <Button.Label>OK</Button.Label>
                </Button.Root>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** Starts collapsed and opens by itself when something fails. */
function useOperationExpansion(operation: Operation | undefined) {
  const [expanded, setExpanded] = React.useState(false);
  const status = operation?.status;
  React.useEffect(() => {
    setExpanded(status === "failed");
  }, [status]);
  return [expanded, setExpanded] as const;
}

export { OperationStatus, OperationSteps, useOperationExpansion };
