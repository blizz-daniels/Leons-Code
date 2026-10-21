const CHANNEL = "javalab-execution-v1";

export class ExecutionEngine {
  constructor({ onMessage = () => {} } = {}) {
    this.onMessage = onMessage;
    this.active = null;
    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener("message", this.handleMessage);
  }

  run({ code, metadata, timeoutMs = 3000, args = [] }) {
    this.stop("replaced");
    const sessionId = crypto.randomUUID();
    const iframe = document.createElement("iframe");
    iframe.className = "execution-sandbox";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "Isolated Java program execution");
    iframe.setAttribute("aria-hidden", "true");
    const session = { sessionId, iframe, metadata, timer: null, completed: false };
    this.active = session;
    session.timer = window.setTimeout(() => {
      if (this.active?.sessionId !== sessionId || session.completed) return;
      this.finish(session, "timeout", { message: `Execution stopped after ${timeoutMs} ms.` });
    }, timeoutMs + 300);
    iframe.srcdoc = sandboxDocument({ sessionId, code, timeoutMs, args });
    document.body.append(iframe);
    this.onMessage({ type: "started", sessionId, metadata });
    return sessionId;
  }

  stop(reason = "stopped") {
    if (!this.active || this.active.completed) return false;
    this.finish(this.active, reason, { message: reason === "stopped" ? "Execution stopped." : "Execution session replaced." });
    return true;
  }

  handleMessage(event) {
    const session = this.active;
    const message = event.data;
    if (!session || event.source !== session.iframe.contentWindow || !isExecutionMessage(message) || message.sessionId !== session.sessionId) return;
    if (message.type === "output") {
      this.onMessage(message);
      return;
    }
    if (["completed", "runtime-error"].includes(message.type)) this.finish(session, message.type, message);
  }

  finish(session, type, detail) {
    if (session.completed) return;
    session.completed = true;
    window.clearTimeout(session.timer);
    session.iframe.remove();
    if (this.active?.sessionId === session.sessionId) this.active = null;
    this.onMessage({ type, sessionId: session.sessionId, ...detail });
  }

  destroy() {
    this.stop();
    window.removeEventListener("message", this.handleMessage);
  }
}

function isExecutionMessage(value) {
  return value && typeof value === "object" && value.channel === CHANNEL && typeof value.type === "string" && typeof value.sessionId === "string";
}

function sandboxDocument({ sessionId, code, timeoutMs, args }) {
  const configuration = JSON.stringify({ sessionId, deadline: Date.now() + timeoutMs, args }).replace(/</g, "\\u003c");
  const safeCode = code.replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'">
<script>
(() => {
  const config = ${configuration};
  const send = (type, detail = {}) => parent.postMessage({ channel: "${CHANNEL}", sessionId: config.sessionId, type, ...detail }, "*");
  let outputSize = 0;
  const javaString = (value) => value === null ? "null" : value === true ? "true" : value === false ? "false" : String(value);
  const defaultValue = (type) => type === "boolean" ? false : type === "char" ? "\\0" : ["byte", "short", "int", "long", "float", "double"].includes(type) ? 0 : null;
  const toInt = (value) => Number(value) | 0;
  const binary = (operator, left, right, type = "int") => {
    if (operator === "+" && (type === "String" || typeof left === "string" || typeof right === "string")) return javaString(left) + javaString(right);
    if (operator === "/" && ["byte", "short", "int", "long", "char"].includes(type)) {
      if (Number(right) === 0) throw new Error("ArithmeticException: / by zero");
      return toInt(Math.trunc(Number(left) / Number(right)));
    }
    if (operator === "%" && Number(right) === 0) throw new Error("ArithmeticException: / by zero");
    const value = ({ "+": () => Number(left) + Number(right), "-": () => Number(left) - Number(right), "*": () => Number(left) * Number(right), "%": () => Number(left) % Number(right) })[operator]?.();
    if (value === undefined) throw new Error("Unsupported arithmetic operator: " + operator);
    return ["byte", "short", "int", "long", "char"].includes(type) ? toInt(value) : value;
  };
  const createArray = (dimensions, type) => {
    const [length = 0, ...rest] = dimensions;
    return Array.from({ length: Math.max(0, toInt(length)) }, () => rest.length ? createArray(rest, type) : defaultValue(type));
  };
  const emit = (kind, values, newline) => {
    const text = values.map(javaString).join("") + (newline ? "\\n" : "");
    outputSize += text.length;
    if (outputSize > 10000) throw new Error("Program output exceeded the JavaLab limit.");
    send("output", { kind, text });
  };
  window.JavaRuntime = {
    args: config.args,
    print: (...values) => emit("out", values, false),
    println: (...values) => emit("out", values, true),
    error: (...values) => emit("err", values, false),
    errorln: (...values) => emit("err", values, true),
    binary,
    defaultValue,
    createArray,
    arrayFromInitializer: (values) => values,
    stringEquals: (left, right) => String(left) === String(right),
    stringLength: (value) => String(value).length,
    math: Math,
    checkExecution: () => { if (Date.now() > config.deadline) throw new Error("Execution timed out after the configured limit."); },
    unsupported: (message) => { throw new Error(message); },
  };
  window.addEventListener("error", (event) => send("runtime-error", { message: event.error?.message || event.message || "Unknown runtime error" }));
  window.addEventListener("unhandledrejection", (event) => send("runtime-error", { message: event.reason?.message || String(event.reason) }));
})();
</script>
<script>
try {
${safeCode}
parent.postMessage({ channel: "${CHANNEL}", sessionId: "${sessionId}", type: "completed" }, "*");
} catch (error) {
parent.postMessage({ channel: "${CHANNEL}", sessionId: "${sessionId}", type: "runtime-error", message: error?.message || String(error) }, "*");
}
</script>`;
}

