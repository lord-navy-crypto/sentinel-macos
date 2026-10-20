import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  type WorkspaceData,
  downloadWorkspace,
  parseWorkspace,
  readWorkspace,
  saveWorkspace,
} from "./workspace";

function decodeWorkspace(contents: string): WorkspaceData {
  const raw: unknown = JSON.parse(contents);
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("version" in raw) ||
    (raw as { version: unknown }).version !== 2 ||
    !("tasks" in raw) ||
    !Array.isArray((raw as { tasks: unknown }).tasks) ||
    !("cards" in raw) ||
    !Array.isArray((raw as { cards: unknown }).cards) ||
    !("notes" in raw) ||
    typeof (raw as { notes: unknown }).notes !== "string"
  ) {
    throw new Error("This is not a valid Daily Desk v2 workspace.");
  }
  return parseWorkspace(raw);
}

/**
 * On first desktop launch, migrate previously saved WebView storage only if
 * the native workspace file does not yet exist. Never replace an existing
 * file after a read error.
 */
export async function loadPersistentWorkspace(): Promise<WorkspaceData> {
  if (!isTauri()) return readWorkspace();
  const contents = await invoke<string | null>("load_workspace");
  return contents === null ? readWorkspace() : decodeWorkspace(contents);
}

/** Desktop writes to an atomic app-data file; browser preview uses localStorage. */
export async function persistWorkspace(value: WorkspaceData): Promise<void> {
  if (isTauri()) {
    await invoke("save_workspace", { contents: JSON.stringify(value) });
    // Best-effort mirror for migration and emergency use. The native file is authoritative.
    saveWorkspace(value);
    return;
  }
  if (!saveWorkspace(value)) throw new Error("Browser storage is unavailable.");
}

export async function exportWorkspaceBackup(value: WorkspaceData): Promise<string> {
  if (!isTauri()) {
    downloadWorkspace(value);
    return "Browser backup requested. Check your downloads.";
  }
  const selected = await save({
    defaultPath: "daily-desk-backup.json",
    filters: [{ name: "Daily Desk JSON", extensions: ["json"] }],
  });
  if (!selected) return "Export cancelled.";
  await invoke("export_backup", { path: selected, contents: JSON.stringify(value, null, 2) });
  return "Backup saved to " + selected;
}

export async function importNativeBackup(): Promise<WorkspaceData | null> {
  if (!isTauri()) throw new Error("Use the JSON file input in a browser preview.");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Daily Desk JSON", extensions: ["json"] }],
  });
  if (typeof selected !== "string") return null;
  const contents = await invoke<string>("read_backup", { path: selected });
  return decodeWorkspace(contents);
}
