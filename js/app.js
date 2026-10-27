import { createEditorState, DEFAULT_SOURCE, isDirty, markSaved } from "./editor/editor-state.js";
import { JavaEditor } from "./editor/editor.js";
import { OutputConsole } from "./ui/console.js";
import { setDiagnosticMessage } from "./ui/diagnostics-panel.js";
import { clearInputQueue } from "./ui/input-panel.js";
import { renderAst, renderDiagnostics } from "./ui/compiler-results.js";
import { compile } from "./compiler/compiler.js";
import { ExecutionEngine } from "./runtime/execution-engine.js";
import { safeJsonParse } from "./utils/helpers.js";
import { createLocalProjectStore, safeFilename } from "./storage/local-projects.js";
import { initializeLearningTools } from "./ui/learning-tools.js";

const SESSION_KEY = "javalab.phase1.session";
const SETTINGS_KEY = "javalab.phase1.settings";

const elements = {
  theme: document.querySelector("#theme-select"),
  projectName: document.querySelector("#project-name"),
  explorerFilename: document.querySelector("#explorer-file-name"),
  editorFilename: document.querySelector("#editor-title"),
  editorStatus: document.querySelector("#editor-status"),
  editorDirtyDot: document.querySelector("#editor-dirty-dot"),
  projectDirtyDot: document.querySelector("#project-dirty-dot"),
  cursorPosition: document.querySelector("#cursor-position"),
  executionStatus: document.querySelector("#execution-status"),
  programInput: document.querySelector("#program-input"),
  diagnostics: { list: document.querySelector("#diagnostics-list"), summary: document.querySelector("#diagnostic-summary") },
  settings: document.querySelector("#settings-popover"),
  wrapLines: document.querySelector("#wrap-lines-setting"),
  restoreSession: document.querySelector("#restore-session-setting"),
};

const savedSettings = readStoredJson(SETTINGS_KEY, {}) || {};
const savedSession = savedSettings.restoreSession === false ? null : readStoredJson(SESSION_KEY, null);
const projectStore = createLocalProjectStore();
let currentProjectId = savedSession?.projectId || null;
const requestedStarter = new URLSearchParams(window.location.search).get("starter");
const starterSource = {
  "java-hello": `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Leon's Code!");\n  }\n}\n`,
  "java-arithmetic": `public class Main {\n  public static void main(String[] args) {\n    int whole = 17 / 3;\n    double precise = 17.0 / 3;\n    System.out.println(whole);\n    System.out.println(precise);\n  }\n}\n`,
  "java-input": `import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner scanner = new Scanner(System.in);\n    System.out.print("Your name: ");\n    String name = scanner.nextLine();\n    System.out.println("Welcome, " + name + "!");\n  }\n}\n`,
}[requestedStarter];
let state = createEditorState(starterSource ? { source: starterSource } : savedSession?.editor);
let projectName = starterSource ? "Guided Java exercise" : savedSession?.projectName || "My Java Project";
elements.projectName.textContent = projectName;
elements.explorerFilename.textContent = state.filename;
elements.editorFilename.textContent = state.filename;

const output = new OutputConsole(document.querySelector("#console"));
const execution = new ExecutionEngine({
  onMessage(message) {
    if (message.type === "started") {
      document.querySelector("#run-button").disabled = true;
      document.querySelector("#stop-button").disabled = false;
      elements.executionStatus.textContent = "Running";
      output.write("Execution started in an isolated sandbox.", "system");
    } else if (message.type === "output") {
      output.write(message.text, message.kind === "err" ? "error" : "output");
    } else if (message.type === "input-request") {
      const mode = message.mode || "token";
      elements.executionStatus.textContent = "Waiting for Scanner input";
      output.write(`Scanner is waiting for a ${mode}. Computation is paused.`, "system");
      output.requestInput({
        mode,
        onSubmit(value) {
          return submitScannerInput(value, { appendLineBreak: true, record: false });
        },
      });
    } else if (message.type === "completed") {
      output.clearInputPrompt();
      document.querySelector("#run-button").disabled = false;
      document.querySelector("#stop-button").disabled = true;
      elements.executionStatus.textContent = "Completed";
      output.write("Execution completed.", "system");
    } else if (["runtime-error", "timeout", "stopped"].includes(message.type)) {
      output.clearInputPrompt();
      document.querySelector("#run-button").disabled = false;
      document.querySelector("#stop-button").disabled = true;
      elements.executionStatus.textContent = message.type === "timeout" ? "Execution Timed Out" : message.type === "stopped" ? "Stopped" : "Runtime Error";
      output.write(message.message || "Execution stopped.", message.type === "stopped" ? "warning" : "error");
      if (message.line) output.write(`Execution source: line ${message.line}${message.column ? `, column ${message.column}` : ""}.`, "error");
      if (message.stack) output.write(message.stack, "error");
    }
  },
});
document.querySelector("#stop-button").addEventListener("click", () => execution.stop());
const editor = new JavaEditor({
  state,
  onChange(nextState, dirty) {
    state = nextState;
    updateDirtyState(dirty);
  },
  onCursorChange({ line, column }) {
    elements.cursorPosition.textContent = `Ln ${line}, Col ${column}`;
  },
});

applySettings(savedSettings);
output.write(starterSource ? "Guided exercise loaded. Run supports the documented Java subset in a bounded, isolated sandbox." : "JavaLab Phase 6 ready. Run supports the documented Java subset in a bounded, isolated sandbox.");

function updateDirtyState(dirty = isDirty(state)) {
  elements.editorDirtyDot.classList.toggle("is-hidden", !dirty);
  elements.projectDirtyDot.classList.toggle("is-hidden", !dirty);
  elements.editorStatus.textContent = dirty ? "Unsaved changes" : "Saved";
}

function persistSession() {
  try {
    const project = projectStore.save({ id: currentProjectId, name: projectName, filename: safeFilename(state.filename), source: state.source });
    currentProjectId = project.id;
    const savedState = markSaved({ ...state, filename: project.filename });
    state = savedState;
    editor.state = savedState;
    elements.explorerFilename.textContent = state.filename;
    elements.editorFilename.textContent = state.filename;
    writeStoredJson(SESSION_KEY, { projectId: currentProjectId, projectName, editor: { source: state.source, filename: state.filename } });
    updateDirtyState(false);
    output.write("Saved this project locally in this browser.");
  } catch (error) { output.write(error.message || "Could not save this project locally.", "error"); }
}

function checkSource() {
  elements.executionStatus.textContent = "Checking types";
  const result = compile(state.source);
  renderDiagnostics(elements.diagnostics, result.diagnostics);
  renderAst(document.querySelector("#ast-panel"), result.ast);
  const javascriptPanel = document.querySelector("#javascript-panel");
  if (result.generatedJavaScript) {
    javascriptPanel.replaceChildren();
    const code = document.createElement("pre");
    code.className = "generated-output";
    code.textContent = result.generatedJavaScript;
    javascriptPanel.append(code);
  }
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  if (errors.length) {
    elements.executionStatus.textContent = result.stage === "semantic" ? "Type Error" : "Compilation Error";
    output.write(`Compilation stopped with ${errors.length} error${errors.length === 1 ? "" : "s"}.`, "error");
  } else {
    elements.executionStatus.textContent = "Translated";
    output.write(`Compilation completed: ${result.tokens.length - 1} tokens, AST, type checks, and JavaScript translation.`, "system");
  }
  if (warnings.length) output.write(`Compilation reported ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`, "warning");
  return result;
}

function runSource() {
  const result = checkSource();
  if (result.status !== "compiled" || !result.generatedJavaScript || !result.runtimeMetadata?.entryPoint) {
    output.write(result.status === "compiled" ? "Run requires public static void main(String[] args)." : "Run was not started because compilation failed.", "error");
    return;
  }
  const queuedInput = elements.programInput.value;
  elements.programInput.value = "";
  execution.run({ code: result.generatedJavaScript, metadata: result.runtimeMetadata, args: [], input: queuedInput });
}

function submitScannerInput(value, { appendLineBreak = false, record = true } = {}) {
  const submitted = appendLineBreak ? `${value}\n` : value;
  const delivery = execution.provideInput(submitted);
  if (delivery === "too-large") { output.write("Program input is limited to 65,536 characters.", "error"); return false; }
  if (delivery === "queue-full") { output.write("The input queue is full. Wait for Scanner to request a value or reset the queue.", "warning"); return false; }
  if (!delivery) { output.write("Start a program that uses Scanner before sending input.", "warning"); return false; }
  if (record) output.recordInput(value);
  elements.executionStatus.textContent = "Running";
  if (delivery === "queued") output.write("Input queued for Scanner.", "system");
  return true;
}

function compilerUnavailable(action) {
  return action === "Run" ? runSource() : checkSource();
}

function applySettings(settings) {
  const theme = settings.theme || "dark";
  const wrapLines = Boolean(settings.wrapLines);
  const restoreSession = settings.restoreSession !== false;
  document.documentElement.dataset.theme = theme;
  elements.theme.value = theme;
  elements.wrapLines.checked = wrapLines;
  elements.restoreSession.checked = restoreSession;
  editor.setWrapLines(wrapLines);
}

function persistSettings() {
  writeStoredJson(SETTINGS_KEY, {
    theme: elements.theme.value,
    wrapLines: elements.wrapLines.checked,
    restoreSession: elements.restoreSession.checked,
  });
}

document.querySelector("#save-project-button").addEventListener("click", persistSession);
document.querySelector("#new-project-button").addEventListener("click", () => {
  if (isDirty(state) && !window.confirm("Discard unsaved changes and create a new starter project?")) return;
  projectName = "My Java Project";
  currentProjectId = null;
  elements.projectName.textContent = projectName;
  editor.replaceSource(DEFAULT_SOURCE);
  state = markSaved({ ...editor.state, filename: "Main.java" });
  editor.state = state;
  elements.explorerFilename.textContent = state.filename;
  elements.editorFilename.textContent = state.filename;
  updateDirtyState(false);
  output.write("Created a new starter project. Save when you want to keep it.");
});

document.querySelector("#run-button").addEventListener("click", () => compilerUnavailable("Run"));
document.querySelector("#check-button").addEventListener("click", () => compilerUnavailable("Check"));
document.querySelector("#format-button").addEventListener("click", () => {
  output.write("Formatting is intentionally unavailable until the parser can preserve Java syntax safely.", "warning");
});
document.querySelector("#clear-console-button").addEventListener("click", () => output.clear());
document.querySelector("#reset-input-button").addEventListener("click", () => { execution.clearQueuedInput(); clearInputQueue(elements.programInput); });
document.querySelector("#clear-input-button").addEventListener("click", () => clearInputQueue(elements.programInput));
document.querySelector("#send-input-button").addEventListener("click", () => {
  if (!submitScannerInput(elements.programInput.value)) return;
  clearInputQueue(elements.programInput);
});
document.querySelector("#show-js-button").addEventListener("click", () => activateInspector("javascript"));
document.querySelector("#show-ast-button").addEventListener("click", () => activateInspector("ast"));

for (const button of document.querySelectorAll("[data-collapse]")) {
  button.addEventListener("click", () => {
    const panel = document.querySelector(`[data-panel="${button.dataset.collapse}"]`);
    const collapsed = panel.classList.toggle("is-collapsed");
    button.textContent = collapsed ? "+" : "−";
    button.setAttribute("aria-expanded", String(!collapsed));
  });
}

function activateInspector(name) {
  for (const current of ["javascript", "ast"]) {
    const active = current === name;
    document.querySelector(`#${current}-tab`).classList.toggle("is-active", active);
    document.querySelector(`#${current}-tab`).setAttribute("aria-selected", String(active));
    document.querySelector(`#${current}-panel`).hidden = !active;
  }
}
document.querySelector("#javascript-tab").addEventListener("click", () => activateInspector("javascript"));
document.querySelector("#ast-tab").addEventListener("click", () => activateInspector("ast"));

elements.theme.addEventListener("change", () => {
  document.documentElement.dataset.theme = elements.theme.value;
  persistSettings();
});
document.querySelector("#settings-button").addEventListener("click", (event) => {
  const opening = elements.settings.classList.toggle("is-hidden");
  event.currentTarget.setAttribute("aria-expanded", String(!opening));
});
elements.wrapLines.addEventListener("change", () => {
  editor.setWrapLines(elements.wrapLines.checked);
  persistSettings();
});
elements.restoreSession.addEventListener("change", persistSettings);

const findDialog = document.querySelector("#find-dialog");
const findText = document.querySelector("#find-text");
const replaceText = document.querySelector("#replace-text");
const findCount = document.querySelector("#find-count");
document.querySelector("#find-button").addEventListener("click", openFindDialog);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    persistSession();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openFindDialog();
  }
});
function openFindDialog() {
  findDialog.showModal();
  findText.focus();
  updateFindCount();
}
function updateFindCount() {
  const query = findText.value;
  const count = query ? state.source.split(query).length - 1 : 0;
  findCount.textContent = query ? `${count} match${count === 1 ? "" : "es"}` : "Enter text to search.";
  return count;
}
findText.addEventListener("input", updateFindCount);
document.querySelector("#find-next-button").addEventListener("click", () => {
  const query = findText.value;
  if (!query) return updateFindCount();
  const start = document.querySelector("#editor-input").selectionEnd;
  const index = state.source.indexOf(query, start) >= 0 ? state.source.indexOf(query, start) : state.source.indexOf(query);
  if (index >= 0) document.querySelector("#editor-input").setSelectionRange(index, index + query.length);
  updateFindCount();
});
document.querySelector("#replace-button").addEventListener("click", () => {
  const input = document.querySelector("#editor-input");
  const query = findText.value;
  if (!query) return;
  const selected = state.source.slice(input.selectionStart, input.selectionEnd);
  const index = selected === query ? input.selectionStart : state.source.indexOf(query, input.selectionEnd);
  if (index < 0) return;
  const next = state.source.slice(0, index) + replaceText.value + state.source.slice(index + query.length);
  editor.replaceSource(next, index, index + replaceText.value.length);
  updateFindCount();
});
document.querySelector("#replace-all-button").addEventListener("click", () => {
  const query = findText.value;
  if (!query) return;
  const next = state.source.split(query).join(replaceText.value);
  editor.replaceSource(next);
  updateFindCount();
});

const helpDialog = document.querySelector("#help-dialog");
document.querySelector("#help-button").addEventListener("click", () => helpDialog.showModal());
document.querySelector("#close-help-button").addEventListener("click", () => helpDialog.close());


function currentProject() {
  return { id: currentProjectId, name: projectName, filename: state.filename, source: state.source };
}

function loadLearningProject(project, saved) {
  if (isDirty(state) && !window.confirm("Discard unsaved changes and replace the current source?")) return false;
  currentProjectId = project.id || null;
  projectName = project.name;
  editor.replaceSource(project.source);
  state = saved ? markSaved({ ...editor.state, filename: safeFilename(project.filename) }) : { ...editor.state, filename: safeFilename(project.filename) };
  editor.state = state;
  elements.projectName.textContent = projectName;
  elements.explorerFilename.textContent = state.filename;
  elements.editorFilename.textContent = state.filename;
  updateDirtyState(saved ? false : true);
  return true;
}

initializeLearningTools({
  getProject: currentProject,
  loadProject: loadLearningProject,
  saveProject: persistSession,
  compileSource: checkSource,
  output,
});

window.__javaLabStarted = true;
document.querySelector("#startup-notice").hidden = true;

function readStoredJson(key, fallback) {
  try {
    return safeJsonParse(globalThis.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    output.write("Browser storage is unavailable. Your current work will not be restored automatically.", "warning");
    return false;
  }
}
