import { backendAvailable, invoke } from "./backend.ts";

export interface AboutInfo {
  version: string;
  license: string;
  third_party: string;
}

export async function fetchAbout(): Promise<AboutInfo> {
  if (!backendAvailable()) throw new Error("Open the desktop installer to view the licences.");
  return invoke<AboutInfo>("about");
}
