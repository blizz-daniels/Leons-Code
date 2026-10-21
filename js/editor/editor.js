import { isDirty, redo, undo, updateSource } from "./editor-state.js";
import { highlightJava } from "./syntax-highlighting.js";

export class JavaEditor {
  constructor({ state, onChange, onCursorChange }) {
    this.state = state;
    this.onChange = onChange;
    this.onCursorChange = onCursorChange;
    this.input = document.querySelector("#editor-input");
    this.syntaxCode = document.querySelector("#syntax-code");
    this.lineNumbers = document.querySelector("#line-numbers");
    this.wrap = document.querySelector("#editor-wrap");
    this.input.value = state.source;
    this.render();
    this.bindEvents();
  }

  bindEvents() {
    this.input.addEventListener("input", () => this.setSource(this.input.value));
    this.input.addEventListener("scroll", () => this.syncScroll());
    this.input.addEventListener("click", () => this.updateCursor());
    this.input.addEventListener("keyup", () => this.updateCursor());
    this.input.addEventListener("select", () => this.updateCursor());
    this.input.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  handleKeydown(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.restoreState(event.shiftKey ? redo(this.state) : undo(this.state));
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.restoreState(redo(this.state));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      this.indentSelection(event.shiftKey);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.insertNewline();
    }
  }

  setSource(source) {
    this.state = updateSource(this.state, source);
    this.render();
    this.onChange(this.state, isDirty(this.state));
  }

  restoreState(state) {
    if (state === this.state) return;
    this.state = state;
    this.input.value = state.source;
    this.render();
    this.onChange(this.state, isDirty(this.state));
  }

  replaceSource(source, selectionStart = 0, selectionEnd = selectionStart) {
    this.setSource(source);
    this.input.value = source;
    this.input.setSelectionRange(selectionStart, selectionEnd);
    this.updateCursor();
    this.input.focus();
  }

  indentSelection(outdent) {
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    const source = this.input.value;
    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const selected = source.slice(lineStart, end);
    const adjusted = selected.split("\n").map((line) => {
      if (outdent) return line.replace(/^(    |\t)/, "");
      return `    ${line}`;
    }).join("\n");
    const nextSource = source.slice(0, lineStart) + adjusted + source.slice(end);
    const delta = adjusted.length - selected.length;
    this.replaceSource(nextSource, start + (start === lineStart ? 4 : 0), end + delta);
  }

  insertNewline() {
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    const before = this.input.value.slice(0, start);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const indentation = (line.match(/^\s*/) || [""])[0];
    const additionalIndent = line.trimEnd().endsWith("{") ? "    " : "";
    const insertion = `\n${indentation}${additionalIndent}`;
    const nextSource = before + insertion + this.input.value.slice(end);
    const nextPosition = start + insertion.length;
    this.replaceSource(nextSource, nextPosition);
  }

  setWrapLines(wrapLines) {
    this.wrap.classList.toggle("wrap-lines", wrapLines);
  }

  render() {
    this.syntaxCode.innerHTML = highlightJava(this.state.source) + "\n";
    const lineCount = Math.max(1, this.state.source.split("\n").length);
    this.lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
    this.updateCursor();
  }

  syncScroll() {
    this.syntaxCode.parentElement.scrollTop = this.input.scrollTop;
    this.syntaxCode.parentElement.scrollLeft = this.input.scrollLeft;
    this.lineNumbers.scrollTop = this.input.scrollTop;
  }

  updateCursor() {
    const position = this.input.selectionStart;
    const before = this.input.value.slice(0, position);
    const line = before.split("\n").length;
    const column = position - before.lastIndexOf("\n");
    this.onCursorChange({ line, column });
  }
}

