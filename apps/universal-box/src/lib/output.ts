import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  svg: "image/svg+xml",
  ics: "text/calendar;charset=utf-8",
  srt: "application/x-subrip;charset=utf-8",
  vtt: "text/vtt;charset=utf-8",
  wav: "audio/wav",
  vcf: "text/vcard;charset=utf-8",
};

/** Save an output from one of our local tools, without network or broad filesystem access. */
export async function exportFile(
  suggestedName: string,
  bytes: Uint8Array | string,
): Promise<boolean> {
  const ext = suggestedName.split(".").pop()?.toLowerCase() ?? "";
  if (!MIME[ext]) throw new Error("Unsupported export format");
  const payload = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  if (payload.length > 20_000_000) throw new Error("File exceeds the 20 MB output limit");
  if (isTauri()) {
    const selected = await save({
      defaultPath: suggestedName,
      filters: [{ name: ext.toUpperCase() + " file", extensions: [ext] }],
    });
    if (!selected) return false;
    await invoke("write_output_file", {
      path: selected,
      bytes: Array.from(payload),
    });
    return true;
  }
  const copy = new Uint8Array(payload);
  const url = URL.createObjectURL(new Blob([copy], { type: MIME[ext] }));
  try {
    const link = document.createElement("a");
    link.download = suggestedName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return true;
}
