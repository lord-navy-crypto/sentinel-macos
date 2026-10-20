import { describe, expect, it } from "vitest";
import { isCardDue, scheduleReview } from "./review";
import { parseWorkspace, type DeskCard } from "./workspace";

const card: DeskCard = { id: "a", front: "Capital of France?", back: "Paris", deck: "Geography" };

describe("local flashcard review", () => {
  it("treats imported cards without a schedule as due", () => {
    expect(isCardDue(card, "2026-10-19")).toBe(true);
  });

  it("schedules easy and good reviews into the future", () => {
    const easy = scheduleReview(card, "easy", "2026-10-19");
    const good = scheduleReview(card, "good", "2026-10-19");
    expect(easy.due).toBe("2026-10-22");
    expect(good.due).toBe("2026-10-20");
    expect(easy.deck).toBe("Geography");
    expect(easy.reviews).toBe(1);
  });

  it("returns forgotten cards to today's queue", () => {
    const after = scheduleReview({ ...card, interval: 14, reviews: 4 }, "again", "2026-10-19");
    expect(after.due).toBe("2026-10-19");
    expect(after.interval).toBe(0);
    expect(after.reviews).toBe(5);
  });
});


describe("flashcard storage compatibility", () => {
  it("preserves deck, due date and review interval during backup restore", () => {
    const data = parseWorkspace({
      version: 2,
      tasks: [],
      cards: [{...card, due:"2026-11-12", interval:14, reviews:6}],
      notes: "",
    });
    expect(data.cards[0].deck).toBe("Geography");
    expect(data.cards[0].due).toBe("2026-11-12");
    expect(data.cards[0].interval).toBe(14);
    expect(data.cards[0].reviews).toBe(6);
  });

  it("keeps older cards without study metadata usable", () => {
    const data = parseWorkspace({version:2,tasks:[],cards:[{id:"old",front:"x",back:"y"}],notes:""});
    expect(data.cards[0].deck).toBe("General");
    expect(isCardDue(data.cards[0], "2026-10-19")).toBe(true);
  });
});
