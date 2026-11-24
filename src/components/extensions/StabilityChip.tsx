import type React from "react";
import type { CatalogEntry } from "../../lib/catalog";

const StabilityChip: React.FC<{ stability: NonNullable<CatalogEntry["stability"]> }> = ({
  stability,
}) => {
  if (stability === "stable") return null;
  return (
    <span className="extension-chip leading-normal font-normal tracking-normal">
      {stability === "alpha" ? "Alpha" : "Beta"}
    </span>
  );
};

export { StabilityChip };
