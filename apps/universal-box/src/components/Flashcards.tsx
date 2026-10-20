import { type FormEvent, useMemo, useState } from "react";
import type { DeskCard } from "../lib/workspace";
import { isCardDue, scheduleReview, todayLocalDate, type Rating } from "../lib/review";

type Props = {
  cards: DeskCard[];
  onChange: (cards: DeskCard[]) => void;
};

export default function Flashcards({ cards, onChange }: Props) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("General");
  const [selectedDeck, setSelectedDeck] = useState("All decks");
  const [dueOnly, setDueOnly] = useState(true);
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [search, setSearch] = useState("");

  const today = todayLocalDate();
  const decks = useMemo(() => Array.from(new Set(cards.map(c => c.deck || "General"))).sort(), [cards]);
  const dueCount = cards.filter(card => isCardDue(card, today)).length;
  const filtered = cards.filter(card =>
    (selectedDeck === "All decks" || (card.deck || "General") === selectedDeck) &&
    (!dueOnly || isCardDue(card, today)) &&
    (card.front + " " + card.back).toLowerCase().includes(search.toLowerCase())
  );
  const index = Math.min(position, Math.max(filtered.length - 1, 0));
  const current = filtered[index];

  function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!front.trim() || !back.trim() || cards.length >= 500) return;
    onChange([{
      id: crypto.randomUUID(),
      front: front.trim().slice(0, 300),
      back: back.trim().slice(0, 1200),
      deck: deck.trim().slice(0, 50) || "General",
      due: "",
      interval: 0,
      reviews: 0,
    }, ...cards]);
    setPosition(0);
    setFlipped(false);
    setSearch("");
    setSelectedDeck("All decks");
    setDueOnly(true);
    setFront("");
    setBack("");
  }

  function review(rating: Rating) {
    if (!current) return;
    const updated = scheduleReview(current, rating, today);
    onChange(cards.map(card => card.id === current.id ? updated : card));
    setFlipped(false);
    setPosition(dueOnly ? 0 : Math.min(index + 1, Math.max(filtered.length - 1, 0)));
  }

  function navigate(delta: number) {
    setPosition((previous) => Math.max(0, Math.min(filtered.length - 1, previous + delta)));
    setFlipped(false);
  }

  return (
    <section className="panel">
      <p className="eyebrow">ACTIVE RECALL · LOCAL LEARNING</p>
      <h2>Flashcards & vocabulary</h2>
      <p className="subtle">Organize cards by deck, flip to recall, then choose Again, Good or Easy for a local review schedule. Everything is stored in the Daily Desk workspace.</p>
      <div className="metrics">
        <span><strong>{cards.length}</strong> cards</span>
        <span><strong>{decks.length}</strong> decks</span>
        <span><strong>{dueCount}</strong> due today</span>
      </div>
      <div className="actions">
        <label className="field-label" htmlFor="card-deck-filter">Deck</label>
        <select id="card-deck-filter" className="field" value={selectedDeck} onChange={event => { setSelectedDeck(event.target.value); setPosition(0); setFlipped(false); }}>
          <option>All decks</option>
          {decks.map(value => <option key={value}>{value}</option>)}
        </select>
        <label className="field-label" htmlFor="card-due-filter">
          <input id="card-due-filter" type="checkbox" checked={dueOnly} onChange={event => { setDueOnly(event.target.checked); setPosition(0); setFlipped(false); }} /> Due for review only
        </label>
      </div>
      <div className="flashcard-layout">
        <div>
          <label className="field-label" htmlFor="flashcard-search">Search this collection</label>
          <input id="flashcard-search" className="field" value={search} onChange={(event) => { setSearch(event.target.value); setPosition(0); setFlipped(false); }} placeholder="Search prompts and answers" style={{width:"100%"}} />
          {current ? (
            <button type="button" className="flashcard" onClick={() => setFlipped((value) => !value)} aria-label={flipped ? "Show question" : "Reveal answer"}>
              <span className="card-face-label">{flipped ? "ANSWER" : "QUESTION"} · CLICK TO FLIP</span>
              <strong>{flipped ? current.back : current.front}</strong>
            </button>
          ) : <div className="flashcard empty-card">No cards match these filters. Disable “due only” to browse future reviews, or add a new card.</div>}
          {current && <p className="subtle">{current.deck || "General"} · {current.due ? "Next due " + current.due : "New card"} · {current.reviews ?? 0} reviews</p>}
          {current && flipped && (
            <div className="pill-row" role="group" aria-label="Rate your recall">
              <button type="button" className="secondary-button" onClick={() => review("again")}>Again · today</button>
              <button type="button" className="secondary-button" onClick={() => review("good")}>Good · later</button>
              <button type="button" className="primary-button" onClick={() => review("easy")}>Easy · further away</button>
            </div>
          )}
          <div className="actions spaced">
            <button type="button" className="secondary-button" onClick={() => navigate(-1)} disabled={index === 0 || !current}>Previous</button>
            <span className="subtle">{current ? `${index + 1} of ${filtered.length}` : "0 cards"}</span>
            <button type="button" className="secondary-button" onClick={() => navigate(1)} disabled={index >= filtered.length - 1 || !current}>Next</button>
          </div>
          {current && <button type="button" className="text-button" onClick={() => { if(!window.confirm("Delete this flashcard?")) return; onChange(cards.filter((card) => card.id !== current.id)); setPosition(Math.max(index - 1, 0)); setFlipped(false); }}>Delete current card</button>}
        </div>
        <form className="entry-form" onSubmit={addCard}>
          <h3>Add a new card</h3>
          <label className="field-label" htmlFor="flashcard-deck">Deck / subject</label>
          <input id="flashcard-deck" className="field" value={deck} onChange={event => setDeck(event.target.value)} maxLength={50} placeholder="General, Physics, Vocabulary…" />
          <label className="field-label" htmlFor="flashcard-front">Prompt or word</label>
          <textarea id="flashcard-front" className="field" rows={3} maxLength={300} value={front} onChange={(event) => setFront(event.target.value)} placeholder="e.g. What is the derivative of sin(x)?" />
          <label className="field-label" htmlFor="flashcard-back">Answer or definition</label>
          <textarea id="flashcard-back" className="field" rows={4} maxLength={1200} value={back} onChange={(event) => setBack(event.target.value)} placeholder="e.g. cos(x)" />
          <button className="primary-button" type="submit" disabled={!front.trim() || !back.trim() || cards.length >= 500}>Save flashcard</button>
          <p className="subtle">The review schedule is a simple adjustable interval ladder, not a scientifically validated adaptive algorithm.</p>
        </form>
      </div>
    </section>
  );
}
