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
  checkExtensionMounts,
  configureExtensions,
  ejectAndReboot,
  getExtensionsState,
  installExtension,
  installedVersion,
  loadExtensions,
  refreshCatalog,
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

test("an open catalog picks up new screenshots and keeps them if the next refresh fails", async () => {
  const shot = (name) => ({ url: `assets/${name}.png`, alt: name });
  let listing = entry("night-shift", { screenshots: [shot("picker")] });
  const fetch = async () => {
    if (!listing) throw new Error("offline");
    return Response.json({ schema_version: 1, extensions: [listing] });
  };
  configureExtensions({ fetch, device: simulatedDevice(), catalogUrl: base });
  await loadExtensions();
  const device = getExtensionsState().device;
  listing = entry("night-shift", { version: "0.1.1", screenshots: [shot("on"), shot("off")] });
  const { signal } = new AbortController();
  await refreshCatalog(signal);
  const catalog = getExtensionsState().catalog;
  assert.equal(catalog.entries[0].version, "0.1.1");
  assert.deepEqual(
    catalog.entries[0].screenshots.map((s) => s.url),
    [new URL("assets/on.png", base).href, new URL("assets/off.png", base).href],
  );
  assert.equal(getExtensionsState().device, device);
  listing = null;
  await refreshCatalog(signal);
  assert.equal(getExtensionsState().catalog, catalog);
});

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
      return {
        mounts: "first",
        snapshot: { device: { ...device, token: "first" }, installed: [...installed.values()] },
      };
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
      return { mounts: token, snapshot: { device: { ...device, token }, installed: [] } };
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

test("eject and reboot is gated by firmware, excludes writes and keeps a failed eject retryable", async () => {
  const mounted = simulatedDevice();
  const read = mounted.read;
  let supported = false;
  mounted.read = async () => {
    const snapshot = await read();
    snapshot.snapshot.device.ejectReboot = supported;
    return snapshot;
  };
  let attempts = 0;
  mounted.ejectAndReboot = async (token) => {
    assert.equal(token, "first");
    attempts++;
    if (attempts === 1) throw new Error("busy");
  };
  configureExtensions({ fetch: fakeFetch(), device: mounted, catalogUrl: base });
  await loadExtensions();
  await removeExtension("balance");
  await ejectAndReboot();
  assert.equal(attempts, 0);
  supported = true;
  await loadExtensions();
  await ejectAndReboot();
  assert.equal(getExtensionsState().eject.error, "busy");
  assert.equal(getExtensionsState().restartNeeded, true);
  const pending = ejectAndReboot();
  await installExtension("balance");
  await pending;
  assert.equal(attempts, 2);
  assert.equal(getExtensionsState().device.status, "absent");
  assert.equal(getExtensionsState().eject.status, "ejected");
  assert.equal(getExtensionsState().restartNeeded, false);
});

test("reconnecting after eject refreshes installed versions and clears the old device state", async () => {
  const mounted = simulatedDevice();
  const original = mounted.read;
  let attached = true;
  let inventories = 0;
  mounted.read = async (known) => {
    const mounts = attached ? "same-ipod" : "empty";
    if (known === mounts) return null;
    if (!attached) return { mounts, snapshot: null };
    inventories++;
    const { snapshot } = await original();
    snapshot.device.ejectReboot = true;
    return { mounts, snapshot };
  };
  mounted.ejectAndReboot = async () => {
    attached = false;
  };
  configureExtensions({ fetch: fakeFetch(), device: mounted, catalogUrl: base });
  await loadExtensions();
  await removeExtension("balance");
  await ejectAndReboot();
  const signal = new AbortController().signal;
  await checkExtensionMounts(signal);
  assert.equal(getExtensionsState().eject.status, "ejected");
  attached = true;
  await mounted.write({ id: "balance", version: "2.0.0" });
  await checkExtensionMounts(signal);
  assert.equal(getExtensionsState().eject.status, "idle");
  assert.equal(installedVersion("balance"), "2.0.0");
  const reads = inventories;
  const current = getExtensionsState();
  await checkExtensionMounts(signal);
  assert.equal(inventories, reads);
  assert.equal(getExtensionsState(), current);
  attached = false;
  await checkExtensionMounts(signal);
  assert.equal(installedVersion("balance"), undefined);
  assert.equal(getExtensionsState().device.status, "absent");
});

test("a pending mount probe cannot undo a newer eject", async () => {
  const mounted = simulatedDevice();
  const read = mounted.read;
  let finishProbe;
  mounted.read = async (knownMounts) => {
    const result = await read();
    result.snapshot.device.ejectReboot = true;
    if (knownMounts) {
      await new Promise((resolve) => {
        finishProbe = resolve;
      });
    }
    return result;
  };
  mounted.ejectAndReboot = async () => {};
  configureExtensions({ fetch: fakeFetch(), device: mounted, catalogUrl: base });
  await loadExtensions();
  await removeExtension("balance");
  const pending = checkExtensionMounts(new AbortController().signal);
  await ejectAndReboot();
  finishProbe();
  await pending;
  assert.equal(getExtensionsState().device.status, "absent");
  assert.equal(getExtensionsState().eject.status, "ejected");
});
