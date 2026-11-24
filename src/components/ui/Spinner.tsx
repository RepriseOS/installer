import { cn } from "../../lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={cn(
        "size-4 animate-spin [animation-duration:0.8s] motion-reduce:animate-none",
        className,
      )}
    >
      <circle cx="10" cy="10" r="7.5" strokeOpacity="0.15" />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" strokeLinecap="round" />
    </svg>
  );
}
