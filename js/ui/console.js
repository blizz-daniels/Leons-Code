const MAX_ENTRIES = 250;

export class OutputConsole {
  constructor(element) {
    this.element = element;
    this.template = document.querySelector("#console-entry-template");
    this.inputPrompt = null;
  }

  write(message, kind = "system") {
    const shouldFollow = this.element.scrollTop + this.element.clientHeight >= this.element.scrollHeight - 8;
    const entry = this.template.content.firstElementChild.cloneNode(true);
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    entry.classList.add(`console-entry--${kind}`);
    entry.querySelector("time").textContent = timestamp;
    entry.querySelector(".console-label").textContent = kind;
    entry.querySelector(".console-message").textContent = message;
    this.element.append(entry);
    while (this.element.querySelectorAll(".console-entry").length > MAX_ENTRIES) this.element.querySelector(".console-entry").remove();
    if (shouldFollow) this.element.scrollTop = this.element.scrollHeight;
  }

  requestInput({ mode = "token", onSubmit } = {}) {
    this.clearInputPrompt();
    const form = document.createElement("form");
    form.className = "console-input-prompt";
    form.noValidate = true;
    const label = document.createElement("label");
    const input = document.createElement("input");
    const submit = document.createElement("button");
    const promptId = `scanner-input-${Date.now()}`;
    label.htmlFor = promptId;
    label.textContent = `Scanner ${mode === "line" ? "line" : "value"}:`;
    input.id = promptId;
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = mode === "line" ? "Type a line, then press Enter" : "Type a value, then press Enter";
    submit.type = "submit";
    submit.textContent = "Submit";
    form.append(label, input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (onSubmit?.(input.value) === false) return;
      this.recordInput(input.value);
    });
    this.inputPrompt = form;
    this.element.append(form);
    this.element.scrollTop = this.element.scrollHeight;
    input.focus();
    return input;
  }

  recordInput(value) {
    this.clearInputPrompt();
    this.write(value === "" ? "> ↵ (empty input)" : `> ${value}`, "input");
  }

  clearInputPrompt() {
    if (!this.inputPrompt) return;
    this.inputPrompt.remove();
    this.inputPrompt = null;
  }

  clear() {
    this.element.replaceChildren();
    if (this.inputPrompt) this.element.append(this.inputPrompt);
  }
}

