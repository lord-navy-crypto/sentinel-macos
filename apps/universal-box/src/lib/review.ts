import type { DeskCard } from "./workspace";

export type Rating = "again" | "good" | "easy";

export function todayLocalDate(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isCardDue(card: DeskCard, date = todayLocalDate()): boolean {
  return !card.due || card.due <= date;
}

/** Simple local review scheduler. Not a clinical/validated learning algorithm. */
export function scheduleReview(card: DeskCard, rating: Rating, today = todayLocalDate()): DeskCard {
  const safeInterval = Math.max(0, Math.min(365, card.interval ?? 0));
  let interval = 0;
  if (rating === "good") interval = safeInterval === 0 ? 1 : Math.min(365, Math.max(safeInterval + 1, Math.round(safeInterval * 2.2)));
  if (rating === "easy") interval = safeInterval === 0 ? 3 : Math.min(365, Math.max(safeInterval + 2, Math.round(safeInterval * 3.2)));
  const due = new Date(today + "T12:00:00");
  if (!Number.isFinite(due.getTime())) throw new Error("Review date is invalid");
  due.setDate(due.getDate() + interval);
  return {
    ...card,
    deck: card.deck || "General",
    interval,
    reviews: (card.reviews ?? 0) + 1,
    due: todayLocalDate(due),
  };
}
