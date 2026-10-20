import type { DeskHighlight } from "./workspace";

export type ReadingSpan = { text: string; highlight?: DeskHighlight };

export function splitReadingHighlights(text: string, highlights: DeskHighlight[]): ReadingSpan[] {
  const spans: ReadingSpan[] = [];
  let at = 0;
  const ordered = [...highlights].filter(h =>
    Number.isInteger(h.start) && Number.isInteger(h.end) && h.start >= 0 && h.end <= text.length && h.start < h.end
  ).sort((a, b) => a.start - b.start);
  for (const highlight of ordered) {
    if (highlight.start < at) continue; // Defensive against malformed or overlapping imported data.
    if (highlight.start > at) spans.push({ text: text.slice(at, highlight.start) });
    spans.push({ text: text.slice(highlight.start, highlight.end), highlight });
    at = highlight.end;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

export function canHighlight(start: number, end: number, text: string, items: DeskHighlight[]): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 &&
    end > start && end <= text.length && end - start <= 3000 &&
    !items.some(h => start < h.end && h.start < end);
}
