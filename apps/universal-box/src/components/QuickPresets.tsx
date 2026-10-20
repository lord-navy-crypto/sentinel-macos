import { type FormEvent, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import type { DeskPreset } from "../lib/workspace";
import { addPreset, normalisePresetCode } from "../lib/presets";

type Props = {
  presets: DeskPreset[];
  onChange: (next: DeskPreset[]) => void;
};

export default function QuickPresets({ presets, onChange }: Props) {
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [lookup, setLookup] = useState("");
  const [status, setStatus] = useState("");

  function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onChange(addPreset(presets, code, url, description));
      setCode("");
      setUrl("");
      setDescription("");
      setStatus("Preset saved to your local Daily Desk workspace.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openPreset(link: string) {
    try {
      if (isTauri()) await openUrl(link);
      else window.open(link, "_blank", "noopener,noreferrer");
      setStatus("Link opening requested in your browser.");
    } catch (error) {
      setStatus("Unable to open link: " + String(error));
    }
  }

  function lookupPreset() {
    try {
      const term = normalisePresetCode(lookup);
      const found = presets.find(item => item.code === term);
      if (!found) { setStatus("No saved preset matches this short code."); return; }
      void openPreset(found.url);
    } catch (error) { setStatus(String(error)); }
  }

  return <section className="panel">
    <p className="eyebrow">SHORT CODES · LOCAL BOOKMARKS</p>
    <h2>Link presets</h2>
    <p className="subtle">Ported from the website's short-code tool. Save easy-to-remember codes for URLs without creating public redirects, a server account or shared storage. URLs open only when you click.</p>
    <div className="actions">
      <label className="field-label" htmlFor="lookup-short-code">Open saved code</label>
      <input className="field" id="lookup-short-code" value={lookup} onChange={event => setLookup(event.target.value)} placeholder="e.g. physics" maxLength={40} />
      <button className="primary-button" type="button" onClick={lookupPreset} disabled={!lookup.trim()}>Open</button>
    </div>
    <form onSubmit={savePreset}>
      <div className="tools-pair">
        <label className="field-label">Short code
          <input className="field" value={code} maxLength={40} onChange={event => setCode(event.target.value)} placeholder="physics" required />
        </label>
        <label className="field-label">Description
          <input className="field" value={description} maxLength={200} onChange={event => setDescription(event.target.value)} placeholder="My physics notes" />
        </label>
      </div>
      <label className="field-label" htmlFor="preset-link">Web link (http or https)</label>
      <input id="preset-link" type="url" className="field" style={{width:"100%"}} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/" required />
      <div className="actions"><button className="primary-button" type="submit" disabled={!code.trim() || !url.trim() || presets.length >= 100}>Save preset</button></div>
    </form>
    <div className="task-list">
      {presets.length === 0 ? <p className="empty-state">No link presets saved yet.</p> : presets.map(item =>
        <div className="task-row" key={item.id}>
          <div className="task-copy">
            <strong>{item.code}</strong>
            <span className="subtle">{item.description || item.url}</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => { void openPreset(item.url); }}>Open</button>
          <button className="icon-button" type="button" aria-label={"Delete " + item.code} onClick={() => { if (window.confirm("Delete this preset?")) onChange(presets.filter(p => p.id !== item.id)); }}>×</button>
        </div>
      )}
    </div>
    {status && <p className="subtle" role="status">{status}</p>}
  </section>;
}
