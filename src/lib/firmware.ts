import { backendAvailable, createChannel, invoke } from "./backend.ts";

export interface FirmwareInfo {
  filename: string;
  version: string;
  sha256: string;
}

export async function chooseFirmware(
  onSelected: (filename: string) => void,
): Promise<FirmwareInfo | null> {
  if (!backendAvailable()) return Promise.reject("Open the desktop installer to select firmware.");
  const channel = createChannel<string>();
  channel.onmessage = onSelected;
  try {
    return await invoke<FirmwareInfo | null>("choose_firmware", { onSelected: channel });
  } finally {
    // Channel notifications can arrive after the command result.
    channel.onmessage = () => {};
  }
}

export async function cachedFirmware(): Promise<FirmwareInfo | null> {
  if (!backendAvailable()) return null;
  return invoke<FirmwareInfo | null>("cached_firmware");
}
