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
}

export interface DeviceSnapshot {
  device: DeviceInfo;
  installed: InstalledExtension[];
}

/** Storage operations on a mounted iPod. */
export interface ExtensionDevice {
  /** Null when no RepriseOS iPod is mounted. */
  read(): Promise<DeviceSnapshot | null>;
  write(
    extension: Pick<InstalledExtension, "id" | "version">,
    data: ArrayBuffer,
    sha256: string,
    token?: string,
  ): Promise<void>;
  remove(id: string, folder: ExtensionFolder, token?: string): Promise<void>;
}

export const mountedDevice: ExtensionDevice = {
  async read() {
    if (!backendAvailable()) return null;
    const snapshot = await invoke<(DeviceSnapshot & { token: string }) | null>(
      "read_extension_device",
    );
    if (snapshot) snapshot.device.token = snapshot.token;
    return snapshot;
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
  async remove(id, folder, token) {
    await invoke("remove_extension", { token, id, folder });
  },
};
