import type React from "react";
import type { CatalogEntry } from "../../lib/catalog";

const StabilityChip: React.FC<{ stability: NonNullable<CatalogEntry["stability"]> }> = ({
  stability,
}) => {
  if (stability === "stable") return null;
  return (
    <span className="rounded-full border border-[#d7c39c] bg-[#f8efdf] px-2 text-[10.5px] leading-normal font-normal tracking-normal text-[#7a5a24]">
      {stability === "alpha" ? "Alpha" : "Beta"}
    </span>
  );
};

export { StabilityChip };
