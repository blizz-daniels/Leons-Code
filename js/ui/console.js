const MAX_ENTRIES = 250;

export class OutputConsole {
  constructor(element) {
    this.element = element;
    this.template = document.querySelector("#console-entry-template");
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
    while (this.element.children.length > MAX_ENTRIES) this.element.firstElementChild.remove();
    if (shouldFollow) this.element.scrollTop = this.element.scrollHeight;
  }

  clear() {
    this.element.replaceChildren();
  }
}

