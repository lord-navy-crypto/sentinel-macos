import type { DeskPreset } from "./workspace";

export function normalisePresetCode(input: string): string {
  const code = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/u.test(code)) {
    throw new Error("Use 1–40 letters, numbers, dashes or underscores, starting with a letter or number.");
  }
  return code;
}

export function safePresetUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 2000) throw new Error("Link is too long");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only http:// and https:// links can be saved.");
    }
    if (!parsed.hostname) throw new Error("Link must contain a domain.");
    return parsed.href;
  } catch (error) {
    if (error instanceof Error && /Only http:|Link must/.test(error.message)) throw error;
    throw new Error("Enter a valid http:// or https:// URL.");
  }
}

export function addPreset(items: DeskPreset[], codeInput: string, urlInput: string, description: string): DeskPreset[] {
  const code = normalisePresetCode(codeInput);
  const url = safePresetUrl(urlInput);
  if (items.some(item => item.code.toLowerCase() === code)) throw new Error("This short code already exists.");
  if (items.length >= 100) throw new Error("Only 100 local presets can be saved.");
  return [{ id: crypto.randomUUID(), code, url, description: description.slice(0, 200) }, ...items];
}
