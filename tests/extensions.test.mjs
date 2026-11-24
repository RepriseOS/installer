import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  checkCompatibility,
  compareVersions,
  downloadPackage,
  installOrder,
  parseCatalog,
  searchCatalog,
} from "../src/lib/catalog.ts";
import {
  availableUpdates,
  configureExtensions,
  getExtensionsState,
  installExtension,
  installedVersion,
  loadExtensions,
  removeExtension,
} from "../src/lib/extensions.ts";

const base = "https://example.test/catalog/catalog-v1.json";
const packages = new Map();

function entry(id, overrides = {}) {
  const data = new TextEncoder().encode(`rvx:${id}`);
  const sha256 = createHash("sha256").update(data).digest("hex");
  packages.set(`https://example.test/catalog/assets/${id}/${sha256}/${id}.rvx`, data);
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    description: `${id} description`,
    version: "0.1.0",
    author: "RevolaOS",
    license: "GPL-3.0-only",
    category: "effects",
    api: "1.78",
    requires: [],
    firmware_id: "660eb6ff",
    repo: "RepriseOS/repriseos-extensions",
    source_path: `extensions/${id}`,
    tag_prefix: `${id}/v`,
    details: "Details",
    release: null,
    package: { url: `assets/${id}/${sha256}/${id}.rvx`, sha256, size: data.byteLength },
    screenshots: [],
    ...overrides,
  };
}

const document = {
  schema_version: 1,
  extensions: [
    entry("balance"),
    entry("crossfeed", { requires: ["dsp"] }),
    entry("dsp", { category: "library", api: "1.74" }),
    entry("night-shift", { category: "system", api: "1.81" }),
    entry("future", { api: "1.90" }),
  ],
};
const device = {
  model: "iPod classic 7G",
  repriseos: "0.4.0",
  api: "1.82",
  firmwareId: "660eb6ff",
};

function fakeFetch(overrides = {}) {
  return async (url) => {
    if (url === base) return new Response(JSON.stringify(document));
    const data = overrides[url] ?? packages.get(url);
    return data ? new Response(data) : new Response("missing", { status: 404 });
  };
}

function simulatedDevice() {
  const installed = new Map();
  function store(id, version, folder) {
    const entry = document.extensions.find((item) => item.id === id);
    installed.set(folder + id, {
      id,
      version,
      folder,
      name: entry.name,
      requires: entry.requires,
      library: entry.category === "library",
    });
  }
  store("balance", "0.1.0", "/Reprise/Extensions/");
  store("night-shift", "0.0.9", "/Revola/Extensions/");
  return {
    async read() {
      return { device: { ...device, token: "first" }, installed: [...installed.values()] };
    },
    async write({ id, version }) {
      store(id, version, "/Reprise/Extensions/");
    },
    async remove(id, folder) {
      installed.delete(folder + id);
    },
  };
}

test("catalog assets resolve relative to the catalog and versions compare numerically", () => {
  const catalog = parseCatalog(document, base);
  assert.equal(
    catalog[0].package.url.startsWith("https://example.test/catalog/assets/balance/"),
    true,
  );
  assert.throws(() => parseCatalog({ schema_version: 2, extensions: [] }, base), /Unsupported/);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.82", "1.82"), 0);
});

test("compatibility follows firmware, API, RepriseOS version and models", () => {
  const catalog = parseCatalog(document, base);
  const byId = Object.fromEntries(catalog.map((item) => [item.id, item]));
  assert.deepEqual(checkCompatibility(byId.balance, device), { compatible: true });
  assert.equal(checkCompatibility(byId.future, device).compatible, false);
  assert.equal(
    checkCompatibility({ ...byId.balance, firmware_id: "00000000" }, device).compatible,
    false,
  );
  assert.equal(
    checkCompatibility({ ...byId.balance, min_repriseos: "0.5.0" }, device).compatible,
    false,
  );
  assert.equal(
    checkCompatibility({ ...byId.balance, models: ["iPod classic 6G"] }, device).warning,
    "Not tested on iPod classic 7G",
  );
});

test("development bypasses the OS release gate but respects known RVX requirements", () => {
  const balance = parseCatalog(document, base)[0];
  const dev = { ...device, repriseos: "Development", api: "1.81" };
  assert.equal(checkCompatibility({ ...balance, min_repriseos: "0.5.0" }, dev).compatible, true);
  assert.equal(checkCompatibility({ ...balance, api: "1.82" }, dev).compatible, false);
  assert.equal(checkCompatibility({ ...balance, api: "2.0" }, dev).compatible, false);
  assert.equal(
    checkCompatibility(balance, { ...dev, api: null, firmwareId: null }).compatible,
    true,
  );
  assert.equal(checkCompatibility(balance, { ...device, repriseos: "0.3.2" }).compatible, false);
  assert.equal(checkCompatibility(balance, { ...device, api: null }).compatible, false);
});

test("dependencies install first and missing or circular ones are rejected", () => {
  const catalog = parseCatalog(document, base);
  assert.deepEqual(
    installOrder("crossfeed", catalog).map((item) => item.id),
    ["dsp", "crossfeed"],
  );
  const missing = catalog.map((item) =>
    item.id === "crossfeed" ? { ...item, requires: ["nothing"] } : item,
  );
  assert.throws(() => installOrder("crossfeed", missing), /requires nothing/);
  const loop = catalog.map((item) =>
    item.id === "dsp" ? { ...item, requires: ["crossfeed"] } : item,
  );
  assert.throws(() => installOrder("crossfeed", loop), /circular/);
});

test("search hides libraries and matches name, author and repo", () => {
  const catalog = parseCatalog(document, base);
  assert.equal(
    searchCatalog(catalog).some((item) => item.id === "dsp"),
    false,
  );
  assert.deepEqual(
    searchCatalog(catalog, { query: "night" }).map((item) => item.id),
    ["night-shift"],
  );
  assert.equal(searchCatalog(catalog, { query: "revolaos" }).length, 4);
  assert.deepEqual(
    searchCatalog(catalog, { category: "system" }).map((item) => item.id),
    ["night-shift"],
  );
});

test("downloads must match the catalog checksum", async () => {
  const [balance] = parseCatalog(document, base);
  assert.equal((await downloadPackage(balance, fakeFetch())).byteLength, balance.package.size);
  const tampered = fakeFetch({ [balance.package.url]: new TextEncoder().encode("rvx:balanxe") });
  await assert.rejects(downloadPackage(balance, tampered), /checksum/);
});

test("install adds libraries, updates replace legacy copies and removal respects dependents", async () => {
  configureExtensions({
    fetch: fakeFetch(),
    device: simulatedDevice(),
    catalogUrl: base,
  });

  await loadExtensions();
  assert.equal(getExtensionsState().catalog.status, "ready");
  assert.deepEqual(
    availableUpdates().map((item) => item.id),
    ["night-shift"],
  );

  await installExtension("crossfeed");
  const install = getExtensionsState().operations.crossfeed;
  assert.equal(install.status, "done");
  assert.deepEqual(
    install.steps.map((step) => step.label),
    [
      "Check compatibility",
      "Download and verify Dsp 0.1.0",
      "Download and verify Crossfeed 0.1.0",
      "Copy to /Reprise/Extensions/",
    ],
  );
  assert.equal(installedVersion("dsp"), "0.1.0");
  assert.equal(getExtensionsState().restartNeeded, true);

  await installExtension("night-shift");
  assert.equal(getExtensionsState().operations["night-shift"].status, "done");
  assert.deepEqual(
    getExtensionsState()
      .device.installed.filter((item) => item.id === "night-shift")
      .map((item) => [item.folder, item.version]),
    [["/Reprise/Extensions/", "0.1.0"]],
  );

  await removeExtension("dsp");
  const blocked = getExtensionsState().operations.dsp;
  assert.equal(blocked.status, "failed");
  assert.match(blocked.error, /Required by Crossfeed/);
  assert.equal(installedVersion("dsp"), "0.1.0");

  await installExtension("future");
  assert.match(getExtensionsState().operations.future.error, /newer RepriseOS/);
  assert.equal(installedVersion("future"), undefined);
});

test("a failed copy does not offer a retry on a different iPod", async () => {
  let token = "first";
  const mounted = {
    async read() {
      return { device: { ...device, token }, installed: [] };
    },
    async write() {
      token = "second";
      throw new Error("The iPod changed");
    },
  };
  configureExtensions({ fetch: fakeFetch(), device: mounted, catalogUrl: base });
  await loadExtensions();
  await installExtension("balance");
  assert.equal(getExtensionsState().device.info.token, "second");
  assert.equal(getExtensionsState().operations.balance, undefined);
});
