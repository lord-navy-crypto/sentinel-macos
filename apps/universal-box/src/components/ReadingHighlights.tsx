import { useMemo, useRef, useState } from "react";
import type { DeskHighlight } from "../lib/workspace";
import { canHighlight, splitReadingHighlights } from "../lib/highlights";

type Props = {
  text: string;
  highlights: DeskHighlight[];
  onChange: (text: string, highlights: DeskHighlight[]) => void;
};
const INK: Record<string, string> = { yellow: "#fff1a9", green: "#b7efc5", blue: "#bcdcff", pink: "#f7c6df" };

export default function ReadingHighlights({ text, highlights, onChange }: Props) {
  const source = useRef<HTMLTextAreaElement>(null);
  const [color, setColor] = useState("yellow");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<{start:number;end:number}|null>(null);
  const spans = useMemo(() => splitReadingHighlights(text, highlights), [text, highlights]);

  function updateSelection() {
    const el = source.current;
    if (!el) return;
    setSelected({ start: el.selectionStart, end: el.selectionEnd });
  }

  function addHighlight() {
    const start = selected?.start ?? -1, end = selected?.end ?? -1;
    if (highlights.length >= 300) {
      setStatus("The local notebook supports up to 300 highlights.");
      return;
    }
    if (!canHighlight(start,end,text,highlights)) {
      setStatus("Select 1–3,000 new characters in the passage without overlapping another highlight.");
      return;
    }
    onChange(text, [...highlights,{id:crypto.randomUUID(),start,end,color,note:note.slice(0,500)}]);
    setSelected(null);
    setNote("");
    setStatus("Highlighted passage stored locally.");
  }

  function editPassage(value: string) {
    if (highlights.length > 0 && !window.confirm("Editing the passage will clear existing highlight positions and margin notes. Continue?")) return;
    onChange(value, []);
    setSelected(null);
    setStatus(highlights.length ? "Passage updated; old highlight offsets cleared." : "");
  }

  return <section className="panel">
    <p className="eyebrow">ACTIVE READING · LOCAL NOTES</p>
    <h2>Reading highlighter</h2>
    <p className="subtle">Paste a passage, select text in the editor, choose a color and attach a margin note. Highlights stay in your local Daily Desk backup. Changing the passage clears old positions after confirmation.</p>
    <label className="field-label" htmlFor="reading-passage">Reading passage</label>
    <textarea id="reading-passage" className="field text-editor" rows={9} ref={source} maxLength={40000}
      value={text} onSelect={updateSelection} onChange={event => editPassage(event.target.value)}
      placeholder="Paste an English passage, paragraph or quotation…" />
    <div className="actions">
      <span className="subtle">{selected && selected.end>selected.start ? selected.end-selected.start+" characters selected" : "Select text in the passage above"}</span>
      <label className="field-label" htmlFor="reading-ink">Color</label>
      <select id="reading-ink" className="field" value={color} onChange={event => setColor(event.target.value)}>
        {Object.keys(INK).map(ink=><option key={ink}>{ink}</option>)}
      </select>
      <input aria-label="Margin note" className="field" value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="Optional margin note"/>
      <button className="primary-button" type="button" onClick={addHighlight}>Highlight selection</button>
    </div>
    <div className="reading-rendered" aria-label="Highlighted passage preview">
      {text ? spans.map((span,index)=> span.highlight ?
        <mark key={index} style={{backgroundColor:INK[span.highlight.color]||INK.yellow}} title={span.highlight.note||"Highlighted"}>{span.text}</mark> :
        <span key={index}>{span.text}</span>) : <p className="subtle">Your highlighted reading preview appears here.</p>}
    </div>
    {highlights.length > 0 && <div className="task-list">
      {highlights.map(item=><div className="task-row" key={item.id}>
        <span className="task-copy"><strong>{text.slice(item.start,item.end)}</strong><span className="subtle">{item.note || "No note"}</span></span>
        <button type="button" className="icon-button" aria-label="Remove highlight" onClick={()=>onChange(text,highlights.filter(h=>h.id!==item.id))}>×</button>
      </div>)}
    </div>}
    {status && <p className="subtle" role="status">{status}</p>}
  </section>;
}
