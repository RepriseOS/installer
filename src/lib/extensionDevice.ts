import { backendAvailable, invoke } from "./backend.ts";
import type { DeviceInfo } from "./catalog.ts";

export type ExtensionFolder = "/Reprise/Extensions/" | "/Revola/Extensions/";

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  folder: ExtensionFolder;
  requires: string[];
  library: boolean;
  /** The API and firmware the package needs, as in its catalog entry. */
  api: string;
  firmware_id: string;
}

export interface DeviceSnapshot {
  device: DeviceInfo;
  installed: InstalledExtension[];
}

interface DeviceRead {
  mounts: string;
  snapshot: DeviceSnapshot | null;
}

/** Storage operations on a mounted iPod. */
export interface ExtensionDevice {
  /** Null when the supplied mount signature still matches. */
  read(knownMounts?: string): Promise<DeviceRead | null>;
  write(
    extension: Pick<InstalledExtension, "id" | "version">,
    data: ArrayBuffer,
    sha256: string,
    token?: string,
  ): Promise<void>;
  ejectAndReboot(token: string): Promise<void>;
  remove(id: string, folder: ExtensionFolder, token?: string): Promise<void>;
}

export const mountedDevice: ExtensionDevice = {
  async read(knownMounts) {
    if (!backendAvailable())
      return knownMounts === "preview" ? null : { mounts: "preview", snapshot: null };
    const result = await invoke<{
      mounts: string;
      snapshot: (DeviceSnapshot & { token: string }) | null;
    } | null>("read_extension_device", { knownMounts });
    if (result?.snapshot) result.snapshot.device.token = result.snapshot.token;
    return result;
  },
  async write(extension, data, sha256, token) {
    await invoke("write_extension", {
      token,
      package: {
        id: extension.id,
        version: extension.version,
        sha256,
        data: Array.from(new Uint8Array(data)),
      },
    });
  },
  async ejectAndReboot(token) {
    await invoke("eject_and_reboot", { token });
  },
  async remove(id, folder, token) {
    await invoke("remove_extension", { token, id, folder });
  },
};
