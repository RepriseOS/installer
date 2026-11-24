import type React from "react";
import { backendAvailable, openExternalUrl } from "../../lib/backend";
import { cn } from "../../lib/cn";
import { appendSessionLog } from "../../lib/sessionLog";

interface IExternalLinkProps extends Omit<React.ComponentProps<"a">, "href"> {
  href: string;
}

/** Opens in the system browser instead of the installer window. */
const ExternalLink: React.FC<IExternalLinkProps> = ({ href, className, ...props }) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "rounded-sm underline decoration-[#b9b5ae] underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/50",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (!backendAvailable()) return;
        event.preventDefault();
        void openExternalUrl(href).catch((error: unknown) => {
          appendSessionLog(`Could not open ${href}: ${String(error)}`);
        });
      }}
      {...props}
    />
  );
};

export { ExternalLink };
