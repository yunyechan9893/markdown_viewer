import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

type Mode = "edit" | "split" | "preview";
const MODES: Mode[] = ["edit", "split", "preview"];
const FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mainEl = $("main");
const previewEl = $("preview");
const fileNameEl = $("file-name");
const fileStatusEl = $("file-status");
const appWindow = getCurrentWindow();

let filePath: string | null = null;
let savedText = "";
let emptyDismissed = false;

// ---------- 편집기 ----------

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: "var(--colorTextHeading)" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.url], color: "var(--colorTextSecondary)" },
  { tag: tags.link, color: "var(--colorLink)" },
  { tag: tags.quote, color: "var(--colorTextSecondary)" },
]);

const extensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(highlight),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ spellcheck: "false", "aria-label": "마크다운 원문" }),
  EditorView.updateListener.of((u) => {
    if (u.docChanged) {
      scheduleRender();
      refreshFileInfo();
    }
  }),
];

const view = new EditorView({
  parent: $("editor"),
  state: EditorState.create({ doc: "", extensions }),
});

const currentText = () => view.state.doc.toString();
const isDirty = () => currentText() !== savedText;

// ---------- 미리보기 ----------

const md = new MarkdownIt({ html: true, linkify: true });

function render() {
  let html = md.render(currentText());
  // 할 일 목록: "- [ ] 일" / "- [x] 일"을 체크 상자로 바꾼다.
  html = html.replace(/<li>(\s*<p>)?\[([ xX])\][ \t]/g, (_m, p: string | undefined, mark: string) =>
    `<li class="task">${p ?? ""}<input type="checkbox" disabled${mark === " " ? "" : " checked"}> `,
  );
  previewEl.innerHTML = DOMPurify.sanitize(html);
}

let renderTimer: number | undefined;
function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 150);
}

// 미리보기 안의 링크가 앱 화면을 바꾸지 않게, 웹 주소는 기본 브라우저로 연다.
previewEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^(https?:|mailto:)/i.test(href)) openUrl(href);
});

// ---------- 보기 방식 ----------

const segButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".seg button"));

function setMode(mode: Mode) {
  mainEl.dataset.mode = mode;
  for (const b of segButtons) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  try {
    localStorage.setItem("mode", mode);
  } catch {}
  if (mode !== "preview") view.focus();
}

for (const b of segButtons) b.addEventListener("click", () => setMode(b.dataset.mode as Mode));

function cycleMode() {
  const i = MODES.indexOf(mainEl.dataset.mode as Mode);
  setMode(MODES[(i + 1) % MODES.length]);
}

// ---------- 파일 이름 · 상태 ----------

function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function refreshFileInfo() {
  const name = filePath ? baseName(filePath) : "제목 없음.md";
  const dirty = isDirty();
  fileNameEl.textContent = name;
  fileStatusEl.textContent = dirty ? "저장하지 않은 내용이 있습니다" : filePath ? "저장됨" : "";
  appWindow.setTitle(`${dirty ? "● " : ""}${name} — 마크다운`);
  mainEl.classList.toggle("is-empty", !emptyDismissed && !filePath && view.state.doc.length === 0);
}

function dismissEmpty() {
  emptyDismissed = true;
  refreshFileInfo();
  view.focus();
}

$("empty").addEventListener("click", dismissEmpty);

// ---------- 열기 · 저장 ----------

async function confirmDiscard(question: string, okLabel: string) {
  if (!isDirty()) return true;
  return ask(question, { title: "마크다운", kind: "warning", okLabel, cancelLabel: "취소" });
}

async function loadFile(path: string) {
  try {
    const text = await invoke<string>("read_file", { path });
    filePath = path;
    savedText = text;
    view.setState(EditorState.create({ doc: text, extensions }));
    render();
    refreshFileInfo();
    view.focus();
  } catch (err) {
    await message(`파일을 열지 못했습니다: ${err}`, { title: "마크다운", kind: "error" });
  }
}

async function openDialog() {
  if (!(await confirmDiscard("저장하지 않은 내용이 있습니다. 버리고 다른 파일을 열까요?", "버리고 열기"))) return;
  const picked = await open({ multiple: false, directory: false, filters: FILTERS });
  if (typeof picked === "string") await loadFile(picked);
}

async function saveFile() {
  let path = filePath;
  if (!path) {
    path = await save({ defaultPath: "제목 없음.md", filters: FILTERS });
    if (!path) return;
  }
  const text = currentText();
  try {
    await invoke("write_file", { path, contents: text });
    filePath = path;
    savedText = text;
    refreshFileInfo();
  } catch (err) {
    await message(`저장하지 못했습니다: ${err}`, { title: "마크다운", kind: "error" });
  }
}

$("open").addEventListener("click", openDialog);
$("save").addEventListener("click", saveFile);

// 편집기의 기본 단축키보다 먼저 받는다 (Ctrl+/는 CodeMirror의 주석 전환과 겹친다).
window.addEventListener(
  "keydown",
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const action = key === "o" ? openDialog : key === "s" ? saveFile : key === "/" ? cycleMode : null;
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    action();
  },
  true,
);

// ---------- 끌어다 놓기 ----------

getCurrentWebview().onDragDropEvent(async (event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    mainEl.classList.add("is-dragging");
    return;
  }
  mainEl.classList.remove("is-dragging");
  if (p.type !== "drop" || p.paths.length === 0) return;
  const path = p.paths.find((f) => /\.(md|markdown|txt)$/i.test(f)) ?? p.paths[0];
  if (await confirmDiscard("저장하지 않은 내용이 있습니다. 버리고 이 파일을 열까요?", "버리고 열기")) {
    await loadFile(path);
  }
});

// ---------- 닫기 ----------

appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard("저장하지 않은 내용이 있습니다. 저장하지 않고 닫을까요?", "저장하지 않고 닫기"))) {
    event.preventDefault();
  }
});

// ---------- 시작 ----------

let initialMode: Mode = "split";
try {
  const stored = localStorage.getItem("mode") as Mode | null;
  if (stored && MODES.includes(stored)) initialMode = stored;
} catch {}
setMode(initialMode);
render();
refreshFileInfo();

// 탐색기에서 .md를 더블클릭해 실행했으면 그 파일을 연다.
invoke<string | null>("initial_file").then((path) => {
  if (path) loadFile(path);
});
