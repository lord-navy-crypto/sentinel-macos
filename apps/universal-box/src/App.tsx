import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Flashcards from "./components/Flashcards";
import FocusTimer from "./components/FocusTimer";
import EverydayTools, {type Utility} from "./components/EverydayTools";
import ToolLaunchpad, {LOCAL_TOOLS} from "./components/ToolLaunchpad";
import UniversalDesk, {type UniversalMode} from "./components/UniversalDesk";
import UniversalBoxDesk, {type UniversalBoxMode} from "./components/UniversalBoxDesk";
import UniversalLabDesk, {type UniversalLabMode} from "./components/UniversalLabDesk";
import MediaFilesDesk, {type MediaFilesMode} from "./components/MediaFilesDesk";
import OfficePrivacyDesk, {type OfficePrivacyMode} from "./components/OfficePrivacyDesk";
import WorkflowDesk, {type WorkflowMode} from "./components/WorkflowDesk";
import FreeFormatsDesk, {type FreeFormatsMode} from "./components/FreeFormatsDesk";
import ChartDesk from "./components/ChartDesk";
import PdfEverydayDesk, {type PdfEverydayMode} from "./components/PdfEverydayDesk";
import UniversalAccessDesk from "./components/UniversalAccessDesk";
import LocalAIDesk from "./components/LocalAIDesk";
import {readAccessPreferences,writeAccessPreferences,type AccessPreferences} from "./lib/accessPreferences";
import QuickKitDesk, {type QuickKitMode} from "./components/QuickKitDesk";
import ExternalTools from "./components/ExternalTools";
import CodeDesk from "./components/CodeDesk";
import DataDesk from "./components/DataDesk";
import FileDesk, {type FileTab} from "./components/FileDesk";
import MathDesk, {type MathTab} from "./components/MathDesk";
import StudyExtras, {type StudyMode} from "./components/StudyExtras";
import WritingDesk from "./components/WritingDesk";
import DrawingDesk from "./components/DrawingDesk";
import ReadingHighlights from "./components/ReadingHighlights";
import QuickPresets from "./components/QuickPresets";
import {
  type DeskTask,
  type Priority,
  type WorkspaceData,
  parseWorkspace,
  readWorkspace,
} from "./lib/workspace";
import {
  exportWorkspaceBackup,
  importNativeBackup,
  loadPersistentWorkspace,
  persistWorkspace,
} from "./lib/nativeStorage";

type View = "local-ai" | "access" | "pdf-mini" | "charts" | "free-formats" | "workflows" | "office-privacy" | "media-files" | "universal-lab" | "universal-box" | "universal" | "quick-tools" | "external" | "all-tools" | "code" | "tables" | "overview" | "tasks" | "cards" | "focus" | "notes" | "utilities" | "data" | "files" | "math" | "learning" | "writing" | "drawing" | "reading" | "presets";

const menu: { id: View; name: string; symbol: string; description: string }[] = [
  { id: "overview", name: "Overview", symbol: "◫", description: "Your workspace at a glance" },
  { id: "all-tools", name: "All tools / 全部工具", symbol: "▦", description: "Search and open every available tool" },
  { id: "quick-tools", name: "Quick Tools / 快捷小工具", symbol: "✂", description: "Text cleaning, cleaner links, dates and grades" },
  { id: "universal", name: "Universal Tools / 综合工具", symbol: "◈", description: "JSON conversion, timezones, hashes, passwords and photo privacy" },
  { id: "universal-box", name: "Universal Box / 万用工具箱", symbol: "▧", description: "Offline QR batches, calendar invites, ID generators" },
  { id: "universal-lab", name: "Universal Box Lab / 免费工具实验室", symbol: "▤", description: "Local text, subtitles, photo sheets and URL diagnostics" },
  { id: "media-files", name: "Media & Files / 媒体文件工具", symbol: "♫", description: "Offline audio WAV trimming, ZIP safety inspection, icon sizes and photo palette" },
  { id: "office-privacy", name: "Office & Privacy / 办公与隐私工具", symbol: "▥", description: "CSV contacts, mail merge, duplicate file hashes, hidden Unicode" },
  { id: "workflows", name: "Workflow Studio / 批处理工作室", symbol: "⇄", description: "Safe selective ZIP export and image resize → convert → rename → ZIP" },
  { id: "free-formats", name: "Free Formats / 格式自由工具", symbol: "▧", description: "Offline Excel interchange, photo differences and HTML / Unicode coding" },
  { id: "charts", name: "Chart Studio / 数据可视化", symbol: "▥", description: "CSV data → bar/line charts, aggregation and SVG export" },
  { id: "pdf-mini", name: "PDF Mini Editor / PDF 日常编辑", symbol: "▣", description: "Edit PDF metadata, visually crop margins, insert blanks and fill basic text forms" },
  { id: "access", name: "Universal Access / 无障碍与工具助手", symbol: "✳", description: "Readable UI, simple home, keyboard guidance and private task-to-tool recommendations" },
  { id: "local-ai", name: "Easy Local AI / 本地 AI", symbol: "✦", description: "WebLLM on-device chat with WebGPU, model downloads and browser cache management" },
  { id: "external", name: "External Tools / 外部工具", symbol: "↗", description: "Curated official websites for advanced tools" },
  { id: "code", name: "Code editor", symbol: "</>", description: "Local code drafts and snippet library" },
  { id: "tables", name: "CSV Table Desk", symbol: "▤", description: "Filter, sort and export CSV or TSV data" },
  { id: "tasks", name: "Planner", symbol: "✓", description: "Prioritise the next step" },
  { id: "cards", name: "Flashcards", symbol: "Aa", description: "Practise active recall" },
  { id: "focus", name: "Focus timer", symbol: "◷", description: "Make space to focus" },
  { id: "notes", name: "Notes", symbol: "✎", description: "Capture ideas locally" },
  { id: "utilities", name: "Everyday tools", symbol: "⌘", description: "Text, CSV, diff, coding, QR, colors and grouping" },
  { id: "drawing", name: "Black draft board", symbol: "✎", description: "Freehand drawing, annotation and saved PNG" },
  { id: "writing", name: "Write & convert", symbol: "¶", description: "Markdown + LaTeX editor, PDF print and exports" },
  { id: "files", name: "File desk", symbol: "▣", description: "PDF merge/split/rotate, images and Word import" },
  { id: "math", name: "Math & science", symbol: "∑", description: "Calculator, graph, LaTeX, units and vectors" },
  { id: "learning", name: "Study & English", symbol: "✦", description: "Mistake log, exam dates, dictation and instant flip cards" },
  { id: "reading", name: "Reading highlights", symbol: "▧", description: "Select and highlight passages with margin notes" },
  { id: "presets", name: "Link presets", symbol: "↗", description: "Saved short codes for useful websites" },
  { id: "data", name: "Backup & privacy", symbol: "▤", description: "Save or restore your workspace" },
];

const navigationGroups:{title:string;items:View[]}[]=[
  {title:"DISCOVER",items:["overview","access","all-tools","charts"]},
  {title:"FILES & CREATION",items:["files","pdf-mini","free-formats","writing","drawing","tables"]},
  {title:"UNIVERSAL BOX",items:["quick-tools","universal","universal-box","universal-lab","media-files","office-privacy","workflows","utilities","external"]},
  {title:"STUDY & SCIENCE",items:["local-ai","math","learning","reading","cards","focus"]},
  {title:"PERSONAL WORKSPACE",items:["tasks","notes","code","presets","data"]},
];

function todayIso(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function taskSort(a: DeskTask, b: DeskTask): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const rank = { high: 0, normal: 1, low: 2 };
  return rank[a.priority] - rank[b.priority] || (a.due || "9999").localeCompare(b.due || "9999");
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [toolMode,setToolMode] = useState("");
  const [theme,setTheme] = useState<"light"|"dark">(()=>{
    try{return localStorage.getItem("universal-box-theme")==="dark"?"dark":"light";}
    catch{return "light";}
  });
  const [favoriteViews,setFavoriteViews]=useState<View[]>(()=>{
    try{const v=JSON.parse(localStorage.getItem("universal-box-favorite-views")||"[]") as unknown;
      return Array.isArray(v)?v.filter((x):x is View=>typeof x==="string"&&menu.some(i=>i.id===x)).slice(0,12):[];}
    catch{return [];}
  });
  const [recentViews,setRecentViews]=useState<View[]>(()=>{
    try{const v=JSON.parse(localStorage.getItem("universal-box-recent-views")||"[]") as unknown;
      return Array.isArray(v)?v.filter((x):x is View=>typeof x==="string"&&menu.some(i=>i.id===x)).slice(0,8):[];}
    catch{return [];}
  });
  const [commandOpen,setCommandOpen]=useState(false);
  const [commandQuery,setCommandQuery]=useState("");
  const [accessPreferences,setAccessPreferences]=useState<AccessPreferences>(readAccessPreferences);
  const commandInputRef=useRef<HTMLInputElement>(null);
  const commandDialogRef=useRef<HTMLDivElement>(null);
  function openTool(target: string, module?: string) {
    if (!menu.some(item => item.id === target)) return;
    const id=target as View;
    setToolMode(module ?? "");setView(id);setCommandOpen(false);setCommandQuery("");
    setRecentViews(previous=>[id,...previous.filter(v=>v!==id)].slice(0,8));
  }
  function toggleFavorite(id:View){
    setFavoriteViews(previous=>previous.includes(id)?previous.filter(v=>v!==id):[...previous,id].slice(0,12));
  }
  const commands=useMemo(()=>{
    const term=commandQuery.trim().toLocaleLowerCase();
    const values=[
      ...menu.map(item=>({id:"view-"+item.id,name:item.name,description:item.description,view:item.id as string,module:undefined as string|undefined})),
      ...LOCAL_TOOLS.map(item=>({id:"tool-"+item.id,name:item.name,description:item.area,view:item.view,module:item.module})),
    ];
    return (term?values.filter(item=>(item.name+" "+item.description).toLocaleLowerCase().includes(term)):values.filter(item=>["all-tools","workflows","files","charts","office-privacy","free-formats"].includes(item.view))).slice(0,12);
  },[commandQuery]);
  useEffect(()=>{
    try{localStorage.setItem("universal-box-theme",theme);}catch{/* preferences are optional */}
  },[theme]);
  useEffect(()=>{
    try{localStorage.setItem("universal-box-favorite-views",JSON.stringify(favoriteViews));}catch{/* preferences are optional */}
  },[favoriteViews]);
  useEffect(()=>{
    try{localStorage.setItem("universal-box-recent-views",JSON.stringify(recentViews));}catch{/* preferences are optional */}
  },[recentViews]);
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();setCommandOpen(open=>!open);
      }else if(event.key==="Escape")setCommandOpen(false);
    };
    window.addEventListener("keydown",keydown);
    return ()=>window.removeEventListener("keydown",keydown);
  },[]);
  useEffect(()=>{writeAccessPreferences(accessPreferences);},[accessPreferences]);
  useEffect(()=>{
    if(!commandOpen)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    commandInputRef.current?.focus();
    return ()=>previous?.focus();
  },[commandOpen]);
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => readWorkspace());
  const [savedStatus, setSavedStatus] = useState("Loading local workspace...");
  const [storageReady, setStorageReady] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);
  const [draftTask, setDraftTask] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("normal");
  const [taskDue, setTaskDue] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [textInput, setTextInput] = useState("");
  const [jsonResult, setJsonResult] = useState("");
  const [dataMessage, setDataMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadPersistentWorkspace().then((data) => {
      if (!active) return;
      setWorkspace(data);
      setStorageReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      const reason = error instanceof Error ? error.message : String(error);
      // Keep edits in memory but never overwrite an unreadable native file.
      setSavedStatus("Storage unavailable: " + reason + ". Export a backup; changes are not being saved.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const revision = ++saveRevision.current;
    setSavedStatus("Saving locally...");
    // Serialise asynchronous native writes: an older write cannot overwrite a newer edit.
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => persistWorkspace(workspace));
    void saveQueue.current.then(() => {
      if (saveRevision.current === revision) setSavedStatus("Saved locally on this device");
    }).catch((error: unknown) => {
      if (saveRevision.current === revision) {
        const reason = error instanceof Error ? error.message : String(error);
        setSavedStatus("Storage error: " + reason + ". Export a backup.");
      }
    });
  }, [workspace, storageReady]);

  const tasks = workspace.tasks;
  const completed = tasks.filter((task) => task.done).length;
  const openTasks = tasks.length - completed;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const visibleTasks = useMemo(
    () => [...tasks].filter((task) => filter === "all" || (filter === "done" ? task.done : !task.done)).sort(taskSort),
    [tasks, filter],
  );

  function updateTasks(next: DeskTask[]) {
    setWorkspace((current) => ({ ...current, tasks: next }));
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTask.trim();
    if (!title || tasks.length >= 300) return;
    updateTasks([{ id: crypto.randomUUID(), title: title.slice(0, 180), done: false, priority: taskPriority, due: taskDue }, ...tasks]);
    setDraftTask("");
    setTaskDue("");
  }

  function updateTask(id: string, patch: Partial<DeskTask>) {
    updateTasks(tasks.map((task) => task.id === id ? { ...task, ...patch } : task));
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 3_000_000) {
      setDataMessage("This backup exceeds the 3 MB import limit.");
      return;
    }
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (typeof raw !== "object" || raw === null || !("version" in raw) ||
          (raw as { version: unknown }).version !== 2 ||
          !("tasks" in raw) || !("cards" in raw) || !("notes" in raw) ||
          !Array.isArray((raw as { tasks: unknown }).tasks) ||
          !Array.isArray((raw as { cards: unknown }).cards) ||
          typeof (raw as { notes: unknown }).notes !== "string") {
        throw new Error("Not a compatible Daily Desk v2 backup.");
      }
      const data = parseWorkspace(raw);
      if (!window.confirm("Replace your current local tasks, cards, and notes with this backup? Export first if you want to keep them.")) {
        setDataMessage("Import cancelled. Your current workspace is unchanged.");
        return;
      }
      setWorkspace(data);
      setStorageReady(true);
      setDataMessage(`Imported ${data.tasks.length} tasks and ${data.cards.length} flashcards.`);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Could not read this backup.");
    }
  }

  async function importFromNativeDialog() {
    setDataMessage("");
    try {
      const data = await importNativeBackup();
      if (data === null) {
        setDataMessage("Import cancelled.");
        return;
      }
      if (!window.confirm("Replace your existing workspace with this backup? This cannot be undone.")) {
        setDataMessage("Import cancelled. Your workspace is unchanged.");
        return;
      }
      setWorkspace(data);
      setStorageReady(true);
      setDataMessage(`Restored ${data.tasks.length} tasks and ${data.cards.length} flashcards.`);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportBackup() {
    setDataMessage("");
    try {
      const message = await exportWorkspaceBackup(workspace);
      setDataMessage(message);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function renderPlanner() {
    return (
      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">DAILY PLANNER</p><h2>Make the next step clear.</h2><p className="subtle">{openTasks} open tasks · {completed} completed</p></div><span className="stat-pill">{progress}% complete</span></div>
        <form className="task-form structured" onSubmit={addTask}>
          <label className="sr-only" htmlFor="new-task">New task</label>
          <input id="new-task" className="field" maxLength={180} value={draftTask} onChange={(event) => setDraftTask(event.target.value)} placeholder="Add a task, e.g. Revise calculus notes" />
          <label className="sr-only" htmlFor="task-priority">Priority</label>
          <select id="task-priority" className="field" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)}>
            <option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option>
          </select>
          <label className="sr-only" htmlFor="task-due">Due date</label>
          <input id="task-due" className="field date-field" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />
          <button type="submit" className="primary-button" disabled={!draftTask.trim() || tasks.length >= 300}>Add</button>
        </form>
        <div className="pill-row compact" role="group" aria-label="Filter tasks">
          {(["all", "open", "done"] as const).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} className={filter === item ? "pill active-pill" : "pill"}>{item === "all" ? "All tasks" : item === "open" ? "Open" : "Completed"}</button>)}
        </div>
        <div className="task-list">
          {visibleTasks.length === 0 && <p className="empty-state">No tasks in this view. Add your next step above.</p>}
          {visibleTasks.map((task) => (
            <div className="task-row" key={task.id}>
              <input type="checkbox" checked={task.done} onChange={() => updateTask(task.id, { done: !task.done })} aria-label={`Mark ${task.title} as ${task.done ? "not completed" : "completed"}`} />
              <div className="task-copy"><span className={task.done ? "task-title done" : "task-title"}>{task.title}</span><span className="task-meta">{task.priority} priority{task.due ? ` · due ${task.due}` : ""}{task.due && task.due < todayIso() && !task.done ? " · overdue" : ""}</span></div>
              <button type="button" className="icon-button" aria-label={`Remove task ${task.title}`} onClick={() => updateTasks(tasks.filter((item) => item.id !== task.id))}>×</button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderUtilities() {
    const words = textInput.trim() ? textInput.trim().split(/\s+/u).length : 0;
    return (
      <section className="panel">
        <p className="eyebrow">QUICK UTILITIES</p><h2>Text desk</h2><p className="subtle">Count words, characters, and lines, or validate and format JSON. Input stays on this screen.</p>
        <label className="field-label" htmlFor="text-tool-input">Text input</label>
        <textarea className="field text-editor" id="text-tool-input" rows={10} value={textInput} onChange={(event) => setTextInput(event.target.value)} placeholder="Paste a paragraph, Markdown or JSON…" />
        <div className="metrics"><span><strong>{words}</strong> words</span><span><strong>{textInput.length}</strong> characters</span><span><strong>{textInput ? textInput.split(/\r?\n/u).length : 0}</strong> lines</span></div>
        <div className="actions"><button className="primary-button" type="button" onClick={() => { try { setJsonResult(JSON.stringify(JSON.parse(textInput) as unknown, null, 2)); } catch (error) { setJsonResult(error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON"); } }}>Format JSON</button><button className="secondary-button" type="button" onClick={() => { setTextInput(""); setJsonResult(""); }}>Clear</button></div>
        {jsonResult && <><label className="field-label" htmlFor="formatted-json">JSON result</label><textarea id="formatted-json" className="field text-editor" value={jsonResult} rows={8} readOnly /></>}
      </section>
    );
  }

  const activeMenu = menu.find((item) => item.id === view) ?? menu[0];

  return (
    <main className={"app-shell "+(theme==="dark"?"theme-dark":"theme-light")+(accessPreferences.highContrast?" access-contrast":"")
      +(accessPreferences.simplerHome?" access-simple":"")+(accessPreferences.reducedMotion?" access-reduced-motion":"")
      +" access-reading-"+accessPreferences.reading}
      data-theme={theme} data-reading={accessPreferences.reading}>
      <a className="skip-to-content" href="#main-content">跳转到正文 / Skip to content</a>
      <aside className="sidebar" inert={commandOpen}>
        <button type="button" className="sidebar-brand" onClick={()=>openTool("overview")} aria-label="Universal Box Home">
          <span className="brand-mark">U</span><span className="sidebar-brand-text">
            <strong className="brand-name">Universal Box</strong><span className="brand-caption">YOUR TOOLS · YOUR DEVICE</span>
          </span>
        </button>
        <button className="sidebar-quick-search" type="button" onClick={()=>{setCommandOpen(true);setCommandQuery("");}}>
          <span aria-hidden="true">⌕</span><span>Search tools</span><kbd>⌘ K</kbd>
        </button>
        <nav aria-label="Universal Box workspaces" className="sidebar-nav">
          {navigationGroups.map(group=><details className="nav-group" key={group.title} open>
            <summary className="nav-label">{group.title}</summary>
            {group.items.map(id=>{
              const item=menu.find(value=>value.id===id)!;
              return <button type="button" key={id} aria-label={item.name} title={item.name} className={view===id?"nav-item active":"nav-item"}
                aria-current={view===id?"page":undefined} onClick={()=>openTool(id)}>
                <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
                <span className="nav-name">{item.name}</span>
                {item.id==="tasks"&&<span className="nav-count">{openTasks}</span>}
              </button>;
            })}
          </details>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-health"><span className="status-dot" /><span role="status">{savedStatus}</span></div>
          <p>Private by default. Your work stays on your device. Export a backup before switching computers.</p>
        </div>
      </aside>

      <section className="main-panel" inert={commandOpen}>
        <header className="topbar">
          <div className="topbar-title"><span className="topbar-location">WORKSPACE / {activeMenu.name}</span><strong>{activeMenu.name.split(" / ")[0]}</strong></div>
          <div className="topbar-actions">
            <button className="topbar-control topbar-search" type="button" title="Search tools (⌘/Ctrl+K)" onClick={()=>{setCommandOpen(true);setCommandQuery("");}}>⌕ <span>Find a tool</span> <kbd>⌘K</kbd></button>
            <button className="topbar-control icon-control" type="button" onClick={()=>toggleFavorite(view)} title={favoriteViews.includes(view)?"Remove workspace favorite":"Favorite this workspace"}
              aria-label={favoriteViews.includes(view)?"Remove favorite":"Add workspace favorite"} aria-pressed={favoriteViews.includes(view)}>{favoriteViews.includes(view)?"★":"☆"}</button>
            <button className="topbar-control icon-control" type="button" onClick={()=>setTheme(previous=>previous==="light"?"dark":"light")}
              title={theme==="light"?"Switch to dark mode":"Switch to light mode"} aria-label={theme==="light"?"Switch to dark mode":"Switch to light mode"}>
              {theme==="light"?"◐":"☀"}
            </button>
            <button className="topbar-control topbar-access" type="button" onClick={()=>openTool("access")}
              aria-label="Open Universal Access: larger text, contrast and help" title="Accessibility & help">Aa <span>无障碍</span></button>
            <span className="version-pill">v0.29</span>
          </div>
        </header>
        <div id="main-content" className="content" tabIndex={-1}>
          {view === "overview" && <>
            <div className="welcome-heading"><div>
              <p className="eyebrow">YOUR PRIVATE DIGITAL TOOLBOX</p>
              <h1>Everything useful. All in one place.</h1>
              <p className="intro">Create, organize, convert and visualize — with real tools that run on your device. No required account, ads or pay-per-click unlocks.</p>
            </div></div>
            <div className="hero-card">
              <div className="hero-copy">
                <p className="card-eyebrow">WELCOME TO UNIVERSAL BOX</p>
                <h2>Your tools.<br/>Your rules.</h2>
                <p>Work faster with a connected desktop toolbox, not a maze of websites.</p>
                <div className="hero-actions">
                  <button type="button" className="hero-primary" onClick={()=>openTool("all-tools")}>Explore {LOCAL_TOOLS.length} tool entries <span aria-hidden="true">↗</span></button>
                  <button type="button" className="hero-secondary" onClick={()=>{setCommandOpen(true);setCommandQuery("");}}>⌘K Quick launch</button>
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/>
                <div className="visual-core">U</div>
                <div className="visual-chip chip-top">✦ &nbsp; Create</div>
                <div className="visual-chip chip-right">◈ &nbsp; Convert</div>
                <div className="visual-chip chip-bottom">▥ &nbsp; Visualize</div>
              </div>
            </div>
            <div className="overview-insights">
              <div className="insight-card"><span>READY TO USE</span><strong>{LOCAL_TOOLS.length}</strong><small>searchable tool entries</small></div>
              <div className="insight-card"><span>YOUR MOMENTUM</span><strong>{progress}%</strong><small>tasks completed</small>
                <div className="insight-progress"><span style={{width:progress+"%"}} /></div>
              </div>
              <div className="insight-card"><span>LOCAL WORKSPACE</span><strong>{workspace.cards.length}</strong><small>flashcards available</small></div>
            </div>
            <div className="section-heading"><div><p className="eyebrow">GO STRAIGHT TO WHAT MATTERS</p><h2>{favoriteViews.length?"Your favorites":"Start creating"}</h2>
              <p className="subtle">Pin workspaces with the star in the top bar. Favorite choices stay on this device.</p></div>
              <button className="secondary-button" type="button" onClick={()=>openTool("all-tools")}>All tools ↗</button>
            </div>
            <div className="tool-grid overview-grid">
              {(favoriteViews.length?favoriteViews:["files","workflows","free-formats","charts","office-privacy","universal-box"] as View[]).map(id=>{
                const item=menu.find(m=>m.id===id)!;
                return <button key={id} type="button" className="tool-card" onClick={()=>openTool(id)}>
                  <span className="tool-icon">{item.symbol}</span><strong>{item.name}</strong>
                  <span className="subtle">{item.description}</span><span className="tool-state">OPEN WORKSPACE →</span>
                </button>;
              })}
            </div>
            {recentViews.length>0&&<>
              <div className="section-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Recently opened</h2></div></div>
              <div className="recent-strip">{recentViews.slice(0,6).map(id=>{
                const item=menu.find(x=>x.id===id)!;
                return <button className="recent-link" type="button" key={id} onClick={()=>openTool(id)}>
                  <span aria-hidden="true">{item.symbol}</span>{item.name}<span aria-hidden="true">↗</span>
                </button>;
              })}</div>
            </>}
          </>}
          {view === "tasks" && renderPlanner()}
          {view === "cards" && <Flashcards cards={workspace.cards} onChange={(cards) => setWorkspace((current) => ({ ...current, cards }))} />}
          <div hidden={view !== "focus"}><FocusTimer /></div>
          {view === "notes" && <section className="panel"><p className="eyebrow">LOCAL NOTES</p><h2>Keep ideas close at hand.</h2><p className="subtle">Your notes are automatically saved in this application. Export backups in Backup & privacy.</p><label className="field-label" htmlFor="my-notes">My notebook</label><textarea id="my-notes" className="field text-editor" rows={20} maxLength={50000} placeholder="Capture a thought, write a draft or summarise a concept…" value={workspace.notes} onChange={(event) => setWorkspace((current) => ({ ...current, notes: event.target.value }))}/><p className="subtle">{workspace.notes.length.toLocaleString()} characters</p></section>}
          {view === "all-tools" && <ToolLaunchpad onLaunch={openTool} />}
          {view === "quick-tools" && <QuickKitDesk key={toolMode} initialMode={(toolMode||"text") as QuickKitMode} />}
          {view === "universal" && <UniversalDesk key={toolMode} initialMode={(toolMode||"json-csv") as UniversalMode} onOpenCsv={()=>openTool("tables")}/> }
          {view === "universal-box" && <UniversalBoxDesk key={toolMode} initialMode={(toolMode||"qr") as UniversalBoxMode}/> }
          {view === "universal-lab" && <UniversalLabDesk key={toolMode} initialMode={(toolMode||"lines") as UniversalLabMode}/> }
          {view === "media-files" && <MediaFilesDesk key={toolMode} initialMode={(toolMode||"audio") as MediaFilesMode}/> }
          {view === "office-privacy" && <OfficePrivacyDesk key={toolMode} initialMode={(toolMode||"contacts") as OfficePrivacyMode}/> }
          {view === "workflows" && <WorkflowDesk key={toolMode} initialMode={(toolMode||"zip-selective") as WorkflowMode}/> }
          {view === "free-formats" && <FreeFormatsDesk key={toolMode} initialMode={(toolMode||"spreadsheet") as FreeFormatsMode}/> }
          {view === "charts" && <ChartDesk /> }
          {view === "access" && <UniversalAccessDesk preferences={accessPreferences} onChange={setAccessPreferences} onOpenTool={openTool}/> }
          {view === "local-ai" && <LocalAIDesk/> }
          {view === "pdf-mini" && <PdfEverydayDesk key={toolMode} initialMode={(toolMode||"metadata") as PdfEverydayMode} /> }
          {view === "external" && <ExternalTools onOpenPresets={()=>openTool("presets")} />}
          {view === "code" && <CodeDesk snippets={workspace.snippets??[]} onChange={snippets=>setWorkspace(current=>({...current,snippets}))} />}
          {view === "tables" && <DataDesk />}
          {view === "utilities" && <EverydayTools key={toolMode} initial={(toolMode || "stats") as Utility} />}
          {view === "files" && <FileDesk key={toolMode} initialPdfMode={toolMode === "organize" ? "organize" : toolMode === "decorate" ? "decorate" : toolMode === "convert" ? "convert" : "merge"} initialTab={(toolMode === "organize" || toolMode === "decorate" || toolMode === "convert" ? "pdf" : toolMode || "pdf") as FileTab} onSendToWriting={markdown => {setWorkspace(current => ({...current, documentMarkdown: markdown})); setView("writing");}} />}
          {view === "math" && <MathDesk key={toolMode} initialTab={(toolMode||"calculator") as MathTab} />}
          {view === "learning" && <StudyExtras key={toolMode} initialMode={(toolMode||"countdown") as StudyMode} workspace={workspace} onChange={setWorkspace} />}
          {view === "reading" && <ReadingHighlights text={workspace.readingText ?? ""} highlights={workspace.highlights ?? []} onChange={(text, highlights)=>setWorkspace(current=>({...current,readingText:text,highlights}))} />}
          {view === "presets" && <QuickPresets presets={workspace.presets ?? []} onChange={presets=>setWorkspace(current=>({...current,presets}))} />}
          {view === "writing" && <WritingDesk markdown={workspace.documentMarkdown ?? ""} onChange={value=>setWorkspace(current=>({...current,documentMarkdown:value}))}/>}
          {view === "drawing" && <DrawingDesk strokes={workspace.drawing ?? []} onChange={value=>setWorkspace(current=>({...current,drawing:value}))}/>}
          {view === "data" && <section className="panel"><p className="eyebrow">PORTABLE WORKSPACE</p><h2>Backup & privacy</h2><p className="subtle">The desktop app now saves tasks, flashcards and notes in its own local app-data file using atomic writes. A browser preview still uses localStorage. Nothing is synced to the AP website or Vercel.</p><div className="actions"><button className="primary-button" type="button" onClick={() => { void exportBackup(); }}>Export JSON backup</button><button className="secondary-button" type="button" onClick={() => { void importFromNativeDialog(); }}>Import with native file picker</button></div><div className="import-group"><label className="field-label" htmlFor="import-workspace">Or restore from a Daily Desk v2 JSON backup using a file input</label><input className="field" type="file" id="import-workspace" accept=".json,application/json" onChange={(event) => { void importBackup(event); }} /></div>{dataMessage && <p className="subtle" role="status">{dataMessage}</p>}<p className="subtle">Tip: Export a backup before reinstalling or changing devices. Import replaces the current workspace only after confirmation.</p></section>}
          <footer>UNIVERSAL BOX <span>Local-first desktop toolkit · powered by Daily Desk</span></footer>
        </div>
      </section>
      {commandOpen&&<div className="command-backdrop" onMouseDown={()=>setCommandOpen(false)}>
        <div className="command-dialog" ref={commandDialogRef} role="dialog" aria-modal="true" aria-label="Search all Universal Box tools"
          onMouseDown={event=>event.stopPropagation()}
          onKeyDown={event=>{
            if(event.key!=="Tab")return;
            const dialog=commandDialogRef.current;
            if(!dialog)return;
            const elements=Array.from(dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )).filter(el=>el.getClientRects().length>0);
            if(!elements.length){event.preventDefault();return;}
            const first=elements[0],last=elements[elements.length-1];
            const focused=document.activeElement;
            if(event.shiftKey&&(focused===first||!dialog.contains(focused))){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&(focused===last||!dialog.contains(focused))){event.preventDefault();first.focus();}
          }}>
          <div className="command-search-head"><span aria-hidden="true">⌕</span>
            <input ref={commandInputRef} className="command-input" type="search" placeholder="Find a tool or workspace…" value={commandQuery} onChange={event=>setCommandQuery(event.target.value)}
              onKeyDown={event=>{if(event.key==="Enter"&&commands[0])openTool(commands[0].view,commands[0].module);}}/>
            <button type="button" className="command-close" onClick={()=>setCommandOpen(false)} aria-label="Close tool search">ESC</button>
          </div>
          <div className="command-meta">{commandQuery?"MATCHING TOOLS":"SUGGESTED WORKSPACES"}</div>
          <div className="command-results">
            {commands.length===0?<p className="empty-state">No matches. Try PDF, Excel, image, chart or ZIP.</p>
              :commands.map((item,index)=><button key={item.id} type="button" className="command-result"
                onClick={()=>openTool(item.view,item.module)}>
                <span className="command-result-icon">{item.module?"◇":"▦"}</span>
                <span className="command-result-text"><strong>{item.name}</strong><small>{item.description}</small></span>
                {index===0&&<kbd>↵</kbd>}
              </button>)}
          </div>
          <div className="command-footer"><span>Enter opens first match · Esc closes</span><span>PRIVATE • ON DEVICE</span></div>
        </div>
      </div>}
    </main>
  );
}
