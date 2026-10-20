export type Priority = "low" | "normal" | "high";
export type DeskTask = {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  due: string;
};
export type DeskCard = {
  id: string;
  front: string;
  back: string;
  deck?: string;
  due?: string;
  interval?: number;
  reviews?: number;
};
export type DeskExam = { id: string; name: string; date: string };
export type DeskMistake = { id: string; topic: string; correction: string };
export type DeskSnippet = { id: string; title: string; code: string };
export type DeskPreset = { id: string; code: string; url: string; description: string };
export type DeskHighlight = { id: string; start: number; end: number; color: string; note: string };
export type DeskStroke = { color: string; width: number; points: [number,number][] };
export type WorkspaceData = {
  version: 2;
  tasks: DeskTask[];
  cards: DeskCard[];
  notes: string;
  exams?: DeskExam[];
  mistakes?: DeskMistake[];
  snippets?: DeskSnippet[];
  readingNotes?: string;
  documentMarkdown?: string;
  drawing?: DeskStroke[];
  presets?: DeskPreset[];
  readingText?: string;
  highlights?: DeskHighlight[];
};

const STORAGE_KEY = "daily-desk.workspace.v2";
const LEGACY_TASKS_KEY = "daily-desk.tasks.v1";
const MAX_TASKS = 300;
const MAX_CARDS = 500;

export function emptyWorkspace(): WorkspaceData {
  return { version: 2, tasks: [], cards: [], notes: "", exams: [], mistakes: [], snippets: [], readingNotes: "", documentMarkdown: "", drawing: [], presets: [], readingText: "", highlights: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validHighlight(value: unknown): value is DeskHighlight {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    typeof value.start === "number" && Number.isSafeInteger(value.start) &&
    typeof value.end === "number" && Number.isSafeInteger(value.end) &&
    value.start >= 0 && value.end > value.start && value.end <= 40000 &&
    typeof value.color === "string" && typeof value.note === "string";
}

function readPriority(value: unknown): Priority {
  return value === "low" || value === "high" ? value : "normal";
}

function readTask(value: unknown): DeskTask | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  const title = value.title.trim().slice(0, 180);
  if (!title) return null;
  return {
    id: typeof value.id === "string" && value.id.length < 100 ? value.id : crypto.randomUUID(),
    title,
    done: value.done === true,
    priority: readPriority(value.priority),
    due: typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? value.due : "",
  };
}

function readCard(value: unknown): DeskCard | null {
  if (!isRecord(value) || typeof value.front !== "string" || typeof value.back !== "string") return null;
  const front = value.front.trim().slice(0, 300);
  const back = value.back.trim().slice(0, 1200);
  if (!front || !back) return null;
  return {
    id: typeof value.id === "string" && value.id.length < 100 ? value.id : crypto.randomUUID(),
    front,
    back,
    deck: typeof value.deck === "string" ? value.deck.trim().slice(0, 50) || "General" : "General",
    due: typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? value.due : "",
    interval: typeof value.interval === "number" && Number.isFinite(value.interval) ? Math.max(0,Math.min(365,Math.floor(value.interval))) : 0,
    reviews: typeof value.reviews === "number" && Number.isFinite(value.reviews) ? Math.max(0,Math.min(100000,Math.floor(value.reviews))) : 0,
  };
}

export function parseWorkspace(raw: unknown): WorkspaceData {
  if (!isRecord(raw)) throw new Error("Invalid workspace: expected an object.");
  const tasks: DeskTask[] = [];
  const cards: DeskCard[] = [];
  if (Array.isArray(raw.tasks)) {
    for (const item of raw.tasks.slice(0, MAX_TASKS)) {
      const task = readTask(item);
      if (task) tasks.push(task);
    }
  }
  if (Array.isArray(raw.cards)) {
    for (const item of raw.cards.slice(0, MAX_CARDS)) {
      const card = readCard(item);
      if (card) cards.push(card);
    }
  }
  return {
    version: 2,
    tasks,
    cards,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 50000) : "",
    exams: Array.isArray(raw.exams) ? raw.exams.slice(0,100).filter((e):e is DeskExam=>isRecord(e)&&typeof e.id==="string"&&typeof e.name==="string"&&typeof e.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e=>({...e,name:e.name.slice(0,160)})):[],
    mistakes: Array.isArray(raw.mistakes) ? raw.mistakes.slice(0,300).filter((e):e is DeskMistake=>isRecord(e)&&typeof e.id==="string"&&typeof e.topic==="string"&&typeof e.correction==="string").map(e=>({...e,topic:e.topic.slice(0,300),correction:e.correction.slice(0,2000)})):[],
    snippets: Array.isArray(raw.snippets) ? raw.snippets.slice(0,150).filter((e):e is DeskSnippet=>isRecord(e)&&typeof e.id==="string"&&typeof e.title==="string"&&typeof e.code==="string").map(e=>({...e,title:e.title.slice(0,120),code:e.code.slice(0,10000)})):[],
    readingNotes: typeof raw.readingNotes === "string" ? raw.readingNotes.slice(0,30000) : "",
    documentMarkdown: typeof raw.documentMarkdown === "string" ? raw.documentMarkdown.slice(0,50000) : "",
    readingText: typeof raw.readingText === "string" ? raw.readingText.slice(0,40000) : "",
    presets: Array.isArray(raw.presets) ? raw.presets.slice(0,100).filter((v):v is DeskPreset=>
      isRecord(v) && typeof v.id==="string" && typeof v.code==="string" &&
      typeof v.url==="string" && typeof v.description==="string"
    ).map(v=>({id:v.id.slice(0,100),code:v.code.slice(0,50),url:v.url.slice(0,2000),description:v.description.slice(0,200)})):[],
    highlights: Array.isArray(raw.highlights) ? raw.highlights.slice(0,300).filter(validHighlight).map(v=>({id:v.id.slice(0,100),start:v.start,end:v.end,color:v.color.slice(0,25),note:v.note.slice(0,500)})):[],
    drawing: Array.isArray(raw.drawing) ? raw.drawing.slice(0,100).filter((v):v is Record<string,unknown>=>isRecord(v)&&typeof v.color==="string"&&typeof v.width==="number"&&Array.isArray(v.points)).map(v=>({
      color: String(v.color).slice(0,16),
      width: Math.max(1,Math.min(24,Number(v.width))),
      points: (v.points as unknown[]).slice(0,400).filter((p):p is [number,number]=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==="number"&&Number.isFinite(n))).map(p=>[Math.max(0,Math.min(1,p[0])),Math.max(0,Math.min(1,p[1]))] as [number,number]),
    })):[],
  };
}

export function readWorkspace(): WorkspaceData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return parseWorkspace(JSON.parse(stored) as unknown);
    const legacy = localStorage.getItem(LEGACY_TASKS_KEY);
    if (legacy) return parseWorkspace({ tasks: JSON.parse(legacy) as unknown, cards: [], notes: "" });
  } catch {
    // A corrupt browser-storage record must never prevent the application from launching.
  }
  return emptyWorkspace();
}

export function saveWorkspace(value: WorkspaceData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function downloadWorkspace(value: WorkspaceData): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "daily-desk-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
