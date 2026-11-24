import {
  type CatalogEntry,
  type Compatibility,
  checkCompatibility,
  compareVersions,
  type DeviceInfo,
  downloadPackage,
  extensionFolder,
  fetchCatalog,
  installOrder,
} from "./catalog.ts";
import { errorDetail } from "./errors.ts";
import { type ExtensionDevice, type InstalledExtension, mountedDevice } from "./extensionDevice.ts";
import { appendSessionLog } from "./sessionLog.ts";

export type StepStatus = "pending" | "checking" | "passed" | "failed";
export interface OperationStep {
  label: string;
  status: StepStatus;
  detail?: string;
}
export interface Operation {
  kind: "install" | "update" | "remove";
  status: "running" | "done" | "failed";
  steps: OperationStep[];
  error?: string;
}

export interface ExtensionsState {
  catalog: {
    status: "idle" | "loading" | "ready" | "error";
    entries: CatalogEntry[];
    error?: string;
  };
  device: {
    status: "idle" | "loading" | "ready" | "absent" | "error";
    info: DeviceInfo | null;
    installed: InstalledExtension[];
    error?: string;
  };
  operations: Record<string, Operation>;
  restartNeeded: boolean;
  eject: { status: "idle" | "ejecting" | "ejected" } | { status: "failed"; error: string };
}

const initialState: ExtensionsState = {
  catalog: { status: "idle", entries: [] },
  device: { status: "idle", info: null, installed: [] },
  operations: {},
  restartNeeded: false,
  eject: { status: "idle" },
};

let state = initialState;
let observedMounts: string | undefined;
interface Services {
  fetch: typeof fetch;
  device: ExtensionDevice;
  catalogUrl?: string;
}
let dependencies: Services | null = null;
const listeners = new Set<() => void>();

const publish = (next: ExtensionsState) => {
  state = next;
  for (const listener of listeners) listener();
};
export const getExtensionsState = () => state;
export function subscribeToExtensions(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replaces the network and device for tests and previews. */
export function configureExtensions(next: Services) {
  dependencies = next;
  observedMounts = undefined;
  state = initialState;
}
function services() {
  dependencies ??= { fetch: (...args) => fetch(...args), device: mountedDevice };
  return dependencies;
}

export function operationRunning(current = state) {
  return (
    current.eject.status === "ejecting" ||
    Object.values(current.operations).some((operation) => operation.status === "running")
  );
}

export async function loadExtensions() {
  if (operationRunning() || state.catalog.status === "loading" || state.device.status === "loading")
    return;
  publish({
    ...state,
    operations: Object.fromEntries(
      Object.entries(state.operations).filter(([, op]) => op.status !== "done"),
    ),
    catalog: { ...state.catalog, status: "loading", error: undefined },
    device: { ...state.device, status: "loading", error: undefined },
  });
  await Promise.all([refreshCatalog(), refreshDevice()]);
}

export async function refreshCatalog(signal?: AbortSignal) {
  const before = state.catalog;
  if (signal && (signal.aborted || before.status !== "ready" || operationRunning())) return;
  const { fetch: fetchImpl, catalogUrl } = services();
  try {
    const entries = await fetchCatalog(fetchImpl, catalogUrl, signal);
    if (signal?.aborted || state.catalog !== before) return;
    if (!signal) appendSessionLog(`Extension catalog loaded: ${entries.length} entries.`);
    publish({ ...state, catalog: { status: "ready", entries } });
  } catch (error) {
    if (signal?.aborted || state.catalog !== before) return;
    const detail = errorDetail(error);
    appendSessionLog(`Extension catalog failed: ${detail}`);
    if (!signal) publish({ ...state, catalog: { ...before, status: "error", error: detail } });
  }
}

/** The loader uses the first valid copy in path order, with /Reprise first. */
function activeCopy(id: string, current = state) {
  const copies = current.device.installed.filter((item) => item.id === id);
  return copies.find((item) => item.folder === extensionFolder) ?? copies[0];
}

export function installedVersion(id: string, current = state) {
  return activeCopy(id, current)?.version;
}

export interface EntryStatus {
  installed?: string;
  updateAvailable: boolean;
  compatibility: Compatibility | null;
}
export function entryStatus(entry: CatalogEntry, current = state): EntryStatus {
  const installed = installedVersion(entry.id, current);
  const info = current.device.info;
  return {
    installed,
    updateAvailable: !!installed && compareVersions(entry.version, installed) > 0,
    compatibility: info ? checkCompatibility(entry, info) : null,
  };
}

export function availableUpdates(current = state) {
  return current.catalog.entries.filter((entry) => {
    const status = entryStatus(entry, current);
    return status.updateAvailable && status.compatibility?.compatible;
  });
}

function setOperation(id: string, operation: Operation) {
  publish({ ...state, operations: { ...state.operations, [id]: operation } });
}

export function dismissOperation(id: string) {
  if (state.operations[id]?.status === "running") return;
  const { [id]: _, ...operations } = state.operations;
  publish({ ...state, operations });
}

async function runSteps(
  id: string,
  kind: Operation["kind"],
  steps: { label: string; detail?: string; run: () => Promise<void> }[],
) {
  const view: OperationStep[] = steps.map(({ label, detail }) => ({
    label,
    detail,
    status: "pending",
  }));
  const update = (status: Operation["status"], error?: string) =>
    setOperation(id, { kind, status, steps: view.map((step) => ({ ...step })), error });
  update("running");
  for (const [index, step] of steps.entries()) {
    view[index].status = "checking";
    update("running");
    try {
      await step.run();
      view[index].status = "passed";
    } catch (error) {
      view[index].status = "failed";
      const detail = errorDetail(error);
      appendSessionLog(`Extension ${kind} failed for ${id}: ${detail}`);
      await refreshDevice();
      if (state.operations[id]) update("failed", detail);
      return false;
    }
  }
  await refreshDevice();
  if (state.operations[id]) update("done");
  return true;
}

/** Installs or updates an extension and any missing or outdated libraries it requires. */
export async function installExtension(id: string) {
  if (
    operationRunning() ||
    state.catalog.status !== "ready" ||
    state.device.status !== "ready" ||
    !state.device.info
  )
    return;
  const { fetch: fetchImpl, device } = services();
  const kind = installedVersion(id) ? "update" : "install";
  const catalog = state.catalog.entries;
  const info = state.device.info;
  let order: CatalogEntry[];
  try {
    order = installOrder(id, catalog).filter(
      (entry) =>
        entry.id === id ||
        !installedVersion(entry.id) ||
        activeCopy(entry.id)?.library === false ||
        compareVersions(entry.version, installedVersion(entry.id) ?? "0") > 0,
    );
  } catch (error) {
    setOperation(id, { kind, status: "failed", steps: [], error: errorDetail(error) });
    return;
  }

  const packages = new Map<string, ArrayBuffer>();
  const libraries = order.filter((entry) => entry.id !== id);
  appendSessionLog(
    `Extension ${kind} started: ${id}${libraries.length ? ` with ${libraries.map((e) => e.id).join(", ")}` : ""}.`,
  );
  const succeeded = await runSteps(id, kind, [
    {
      label: "Check compatibility",
      detail: `RepriseOS ${info.repriseos}`,
      run: async () => {
        for (const entry of order) {
          const result = checkCompatibility(entry, info);
          if (!result.compatible) throw new Error(`${entry.name}: ${result.reason}.`);
        }
      },
    },
    ...order.map((entry) => ({
      label: `Download and verify ${entry.name} ${entry.version}`,
      detail: entry.id === id ? undefined : "Required",
      run: async () => {
        packages.set(entry.id, await downloadPackage(entry, fetchImpl));
      },
    })),
    {
      label: `Copy to ${extensionFolder}`,
      run: async () => {
        for (const entry of order) {
          const data = packages.get(entry.id) as ArrayBuffer;
          await device.write(
            { id: entry.id, version: entry.version },
            data,
            entry.package.sha256,
            info.token,
          );
          publish({ ...state, restartNeeded: true });
        }
      },
    },
    ...order
      .filter((entry) =>
        state.device.installed.some(
          (installed) => installed.id === entry.id && installed.folder === "/Revola/Extensions/",
        ),
      )
      .map((entry) => ({
        label: `Remove the old ${entry.name} from /Revola/Extensions/`,
        run: () => device.remove(entry.id, "/Revola/Extensions/", info.token),
      })),
  ]);
  if (succeeded) {
    appendSessionLog(`Extension ${kind} finished: ${id} ${order[order.length - 1]?.version}.`);
  }
}

export async function removeExtension(id: string) {
  if (operationRunning() || state.device.status !== "ready" || !state.device.info) return;
  const { device } = services();
  const token = state.device.info.token;
  const copies = state.device.installed.filter((entry) => entry.id === id);
  const succeeded = await runSteps(id, "remove", [
    {
      label: "Check other extensions",
      run: async () => {
        const dependent = state.device.installed.find((item) => item.requires.includes(id));
        if (dependent) throw new Error(`Required by ${dependent.name}.`);
      },
    },
    ...copies.map((copy) => ({
      label: `Remove from ${copy.folder}`,
      run: async () => {
        await device.remove(copy.id, copy.folder, token);
        publish({ ...state, restartNeeded: true });
      },
    })),
  ]);
  if (succeeded) {
    appendSessionLog(`Extension removed: ${id}.`);
  }
}

export async function updateAll() {
  const token = state.device.info?.token;
  for (const entry of availableUpdates()) {
    if (state.device.info?.token !== token) break;
    await installExtension(entry.id);
    if (state.operations[entry.id]?.status === "failed") return;
  }
}

export async function ejectAndReboot() {
  const info = state.device.info;
  if (
    operationRunning() ||
    state.device.status !== "ready" ||
    !state.restartNeeded ||
    !info?.ejectReboot ||
    !info.token
  )
    return;
  publish({ ...state, eject: { status: "ejecting" } });
  try {
    await services().device.ejectAndReboot(info.token);
    observedMounts = undefined;
    publish({
      ...state,
      device: { status: "absent", info: null, installed: [] },
      operations: {},
      restartNeeded: false,
      eject: { status: "ejected" },
    });
  } catch (error) {
    await refreshDevice();
    if (!state.device.info || state.device.info.token === info.token) {
      publish({ ...state, eject: { status: "failed", error: errorDetail(error) } });
    }
  }
}

export async function checkExtensionMounts(signal: AbortSignal) {
  if (signal.aborted || operationRunning() || state.device.status === "loading") return;
  await refreshDevice(signal);
}

async function refreshDevice(signal?: AbortSignal) {
  const before = state;
  // A mount probe can finish after a manual refresh, write, eject, or navigation.
  const stale = () => signal && (signal.aborted || state !== before);
  try {
    const result = await services().device.read(signal ? observedMounts : undefined);
    if (!result || stale()) return;
    const { mounts, snapshot } = result;
    const changed =
      snapshot?.device.token !== state.device.info?.token ||
      (snapshot !== null && observedMounts !== undefined && mounts !== observedMounts);
    observedMounts = mounts;
    publish({
      ...state,
      ...(changed && { operations: {}, restartNeeded: false, eject: { status: "idle" as const } }),
      device: snapshot
        ? { status: "ready", info: snapshot.device, installed: snapshot.installed }
        : { status: "absent", info: null, installed: [] },
    });
  } catch (error) {
    if (stale()) return;
    observedMounts = undefined;
    if (state.device.status === "error" && state.device.error === errorDetail(error)) return;
    publish({
      ...state,
      device: { info: null, installed: [], status: "error", error: errorDetail(error) },
    });
  }
}
