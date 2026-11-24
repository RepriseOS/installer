import type React from "react";
import type { CatalogEntry } from "../../lib/catalog";

interface IExtensionIconProps {
  entry?: CatalogEntry;
  size?: number;
}

// Catalog icons are tall settings-pane images; the top square holds the symbol.
const ExtensionIcon: React.FC<IExtensionIconProps> = ({ entry, size = 40 }) => {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-black bg-black shadow-[inset_0_1px_0_#ffffff30,0_1px_2px_#29241c33]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {entry?.icon ? (
        <img
          className="size-full object-cover object-top"
          src={entry.icon.url}
          alt=""
          width={entry.icon.width}
          height={entry.icon.height}
          draggable={false}
        />
      ) : (
        <svg
          className="size-1/2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c8cbd0"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <path d="M16.5 13.5v6M13.5 16.5h6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
};

export { ExtensionIcon };
