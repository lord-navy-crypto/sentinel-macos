import { useEffect, useRef, useState } from "react";
import FocusNoise from "./FocusNoise";

type TimerMode = "focus" | "short" | "long";
const durations: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 };
const labels: Record<TimerMode, string> = { focus: "Focus", short: "Short break", long: "Long break" };

export default function FocusTimer() {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remaining, setRemaining] = useState(durations.focus * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const deadline = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    deadline.current = Date.now() + remaining * 1000;
    const interval = window.setInterval(() => {
      if (deadline.current === null) return;
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        window.clearInterval(interval);
        deadline.current = null;
        setRunning(false);
        if (mode === "focus") setCompleted((number) => number + 1);
      }
    }, 250);
    return () => window.clearInterval(interval);
    // A running session owns a single wall-clock deadline. Pause/change mode through the controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function chooseMode(next: TimerMode) {
    setRunning(false);
    deadline.current = null;
    setMode(next);
    setRemaining(durations[next] * 60);
  }

  function toggle() {
    if (running && deadline.current !== null) {
      setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
      deadline.current = null;
      setRunning(false);
    } else if (remaining > 0) {
      setRunning(true);
    }
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <section className="panel">
      <p className="eyebrow">FOCUS SESSION</p>
      <h2>Make room for deep work.</h2>
      <p className="subtle">Choose a session length, then work at your own pace. Sessions are kept on this screen.</p>
      <div className="pill-row" role="group" aria-label="Timer session type">
        {(Object.keys(durations) as TimerMode[]).map((item) => (
          <button className={mode === item ? "pill active-pill" : "pill"} type="button" key={item} onClick={() => chooseMode(item)}>{labels[item]} · {durations[item]}m</button>
        ))}
      </div>
      <div className="timer-display" role="timer" aria-label={`Time remaining: ${minutes} minutes ${seconds} seconds`}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </div>
      <div className="actions">
        <button type="button" className="primary-button" onClick={toggle} disabled={remaining === 0}>{running ? "Pause session" : "Start session"}</button>
        <button type="button" className="secondary-button" onClick={() => chooseMode(mode)}>Reset</button>
      </div>
      <FocusNoise />
      <p className="subtle session-note">{completed} focus session{completed === 1 ? "" : "s"} completed this visit. You can switch tools without losing your session.</p>
    </section>
  );
}
