export const catalogUrl =
  (import.meta.env?.VITE_EXTENSION_CATALOG_URL as string | undefined) ||
  "https://raw.githubusercontent.com/RepriseOS/extensions/catalog/catalog-v1.json";

export interface CatalogFile {
  url: string;
  sha256: string;
  size: number;
}
export interface CatalogImage extends CatalogFile {
  width: number;
  height: number;
}
export interface CatalogScreenshot extends CatalogImage {
  alt: string;
}
export interface CatalogRelease {
  tag: string;
  url: string;
  commit: string;
  published_at: string;
}
export type Category = "effects" | "media" | "system" | "other" | "library";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  category: Category;
  api: string;
  requires: string[];
  firmware_id: string;
  repo: string;
  source_path: string;
  tag_prefix: string;
  details: string;
  release: CatalogRelease | null;
  package: CatalogFile;
  stability?: "alpha" | "beta" | "stable";
  note?: string;
  author_handle?: string;
  min_repriseos?: string;
  models?: string[];
  icon?: CatalogImage;
  screenshots: CatalogScreenshot[];
}

export interface DeviceInfo {
  model: string;
  repriseos: string;
  api: string | null;
  firmwareId: string | null;
  /** The lowest SDK the firmware loads packages from, when it refuses older ones. */
  sdkFloor?: string | null;
  revision?: string | null;
  token?: string;
  ejectReboot?: boolean;
}

export const categoryLabels: Record<Category, string> = {
  effects: "Sound",
  media: "Media",
  system: "System",
  other: "Other",
  library: "Library",
};

export const extensionFolder = "/Reprise/Extensions/";

/** Parses catalog-v1.json and resolves its asset URLs against the catalog location. */
export function parseCatalog(document: unknown, base: string): CatalogEntry[] {
  const catalog = document as { schema_version?: unknown; extensions?: unknown };
  if (catalog?.schema_version !== 1 || !Array.isArray(catalog.extensions)) {
    throw new Error(`Unsupported extension catalog (schema ${String(catalog?.schema_version)}).`);
  }
  const resolve = <T extends CatalogFile>(file: T): T => ({
    ...file,
    url: new URL(file.url, base).href,
  });
  return (catalog.extensions as CatalogEntry[]).map((entry) => ({
    ...entry,
    package: resolve(entry.package),
    icon: entry.icon && resolve(entry.icon),
    screenshots: (entry.screenshots ?? []).map(resolve),
  }));
}

export async function fetchCatalog(
  fetchImpl: typeof fetch = fetch,
  url: string = catalogUrl,
  signal?: AbortSignal,
) {
  const response = await fetchImpl(url, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`The extension catalog is unavailable (${response.status}).`);
  return parseCatalog(await response.json(), url);
}

/** Compares x.y.z (or major.minor) versions numerically. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export type Compatibility =
  | { compatible: true; warning?: string }
  | { compatible: false; summary: string; reason: string };

/** Mirrors the firmware's package checks plus the listing's optional requirements. */
export function checkCompatibility(
  entry: Pick<CatalogEntry, "api" | "firmware_id" | "min_repriseos" | "models"> & { sdk?: string },
  device: DeviceInfo,
): Compatibility {
  const development = device.repriseos === "Development";
  const release = device.repriseos.split("+")[0];
  const releaseCore = release.split("-")[0];
  if (!development && compareVersions(releaseCore, "0.3.2") <= 0) {
    return {
      compatible: false,
      summary: "Needs newer RepriseOS",
      reason: "This RepriseOS release does not support RVX",
    };
  }
  if ((!device.api || !device.firmwareId) && !development) {
    return {
      compatible: false,
      summary: "Unknown RVX runtime",
      reason: "RVX runtime could not be identified",
    };
  }
  if (device.firmwareId && entry.firmware_id !== device.firmwareId) {
    return {
      compatible: false,
      summary: "Different firmware",
      reason: "Built for different firmware",
    };
  }
  const newerRelease =
    !development &&
    !!entry.min_repriseos &&
    (compareVersions(entry.min_repriseos, releaseCore) > 0 ||
      (entry.min_repriseos === releaseCore && release.includes("-")));
  const [major] = entry.api.split(".");
  const deviceMajor = device.api?.split(".")[0];
  if (device.api && (major !== deviceMajor || compareVersions(entry.api, device.api) > 0)) {
    return {
      compatible: false,
      summary: "Needs newer RepriseOS",
      reason: newerRelease
        ? `Needs RepriseOS ${entry.min_repriseos}`
        : `Needs a newer RepriseOS (API ${entry.api})`,
    };
  }
  // A catalog entry has no SDK field; the SDK that packed it is at least its api.
  if (device.sdkFloor && compareVersions(entry.sdk ?? entry.api, device.sdkFloor) < 0) {
    return {
      compatible: false,
      summary: "Older build",
      reason: "Built for an older RepriseOS",
    };
  }
  if (newerRelease) {
    return {
      compatible: false,
      summary: "Needs newer RepriseOS",
      reason: `Needs RepriseOS ${entry.min_repriseos}`,
    };
  }
  if (
    entry.models?.length &&
    !entry.models.some((model) => device.model.toLowerCase().includes(model.toLowerCase()))
  ) {
    return { compatible: true, warning: `Not tested on ${device.model}` };
  }
  if (development && (!device.api || !device.firmwareId)) {
    return { compatible: true, warning: "Development build · RVX compatibility unverified" };
  }
  return { compatible: true };
}

/**
 * Returns the entries to install for `id`, dependencies first.
 * Throws when a required library is missing from the catalog or the graph loops.
 */
export function installOrder(id: string, catalog: CatalogEntry[]) {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const order: CatalogEntry[] = [];
  const visiting = new Set<string>();
  const visit = (current: string, parent?: string) => {
    if (order.some((entry) => entry.id === current)) return;
    const entry = byId.get(current);
    if (!entry) throw new Error(`${parent ?? "It"} requires ${current}, which is not listed.`);
    if (visiting.has(current)) throw new Error(`${entry.name} has a circular dependency.`);
    visiting.add(current);
    for (const dependency of entry.requires) visit(dependency, entry.name);
    visiting.delete(current);
    order.push(entry);
  };
  visit(id);
  return order;
}

export function searchCatalog(
  catalog: CatalogEntry[],
  { query = "", category = "all" as Category | "all" } = {},
) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((entry) => {
    if (entry.category === "library") return false;
    if (category !== "all" && entry.category !== category) return false;
    const text = [
      entry.name,
      entry.description,
      entry.author,
      entry.author_handle ?? "",
      entry.repo,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Downloads a package and rejects it unless its size and SHA-256 match the catalog. */
export async function downloadPackage(entry: CatalogEntry, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(entry.package.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  const data = await response.arrayBuffer();
  if (data.byteLength !== entry.package.size || (await sha256Hex(data)) !== entry.package.sha256) {
    throw new Error("The download does not match the catalog checksum.");
  }
  return data;
}

export function sourceUrl(entry: CatalogEntry) {
  const ref = encodeURIComponent(entry.release?.tag ?? "HEAD");
  return entry.source_path
    ? `https://github.com/${entry.repo}/tree/${ref}/${entry.source_path}`
    : `https://github.com/${entry.repo}`;
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
