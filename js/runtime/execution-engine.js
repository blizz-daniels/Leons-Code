const CHANNEL = "javalab-execution-v1";
const DEFAULT_TIMEOUT_MS = 3_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_CHARS = 10_000;
const MAX_ERROR_MESSAGE_CHARS = 1_000;
const MAX_INPUT_CHARS = 65_536;
const MAX_ARRAY_ELEMENTS = 100_000;
const MAX_QUEUED_INPUTS = 32;

export class ExecutionEngine {
  constructor({ onMessage = () => {} } = {}) {
    this.onMessage = onMessage;
    this.active = null;
    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener("message", this.handleMessage);
  }

  run({ code, metadata, timeoutMs = DEFAULT_TIMEOUT_MS, inputTimeoutMs = 0, args = [], input = "" }) {
    this.stop("replaced");
    const executionTimeout = normalizeTimeout(timeoutMs);
    const inputTimeout = normalizeInputTimeout(inputTimeoutMs);
    const sessionId = crypto.randomUUID();
    const iframe = document.createElement("iframe");
    iframe.className = "execution-sandbox";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "Isolated Java program execution");
    iframe.referrerPolicy = "no-referrer";
    iframe.setAttribute("aria-hidden", "true");
    const initialInput = normalizeInput(input);
    const session = { sessionId, iframe, metadata, timer: null, timerStartedAt: null, inputTimer: null, remainingMs: executionTimeout, inputTimeoutMs: inputTimeout, completed: false, pendingInput: null, queuedInput: initialInput ? [initialInput] : [], outputSize: 0 };
    this.active = session;
    iframe.srcdoc = sandboxDocument({ sessionId, code, timeoutMs: executionTimeout, args });
    document.body.append(iframe);
    this.armComputationTimer(session);
    this.onMessage({ type: "started", sessionId, metadata });
    return sessionId;
  }

  stop(reason = "stopped") {
    if (!this.active || this.active.completed) return false;
    this.finish(this.active, reason, { message: reason === "stopped" ? "Execution stopped." : "Execution session replaced." });
    return true;
  }

  provideInput(value) {
    const session = this.active;
    if (!session || session.completed) return false;
    const input = normalizeInput(value);
    if (input === null && value !== null) return "too-large";
    if (!session.pendingInput && session.queuedInput.length >= MAX_QUEUED_INPUTS) return "queue-full";
    if (session.pendingInput) {
      this.deliverInput(session, input);
      return "sent";
    }
    session.queuedInput.push(input);
    return "queued";
  }

  clearQueuedInput() {
    if (!this.active || this.active.completed) return false;
    this.active.queuedInput = [];
    return true;
  }
  handleMessage(event) {
    const session = this.active;
    const message = event.data;
    if (!session || event.source !== session.iframe.contentWindow || !isExecutionMessage(message) || message.sessionId !== session.sessionId) return;
    if (message.type === "output") {
      if (session.outputSize + message.text.length > MAX_OUTPUT_CHARS) return this.finish(session, "runtime-error", { message: "Program output exceeded the JavaLab limit." });
      session.outputSize += message.text.length;
      this.onMessage(message);
      return;
    }
    if (message.type === "input-request") {
      if (session.pendingInput) return;
      this.pauseComputationTimer(session);
      if (session.queuedInput.length) {
        session.pendingInput = message;
        this.deliverInput(session, session.queuedInput.shift());
      } else {
        session.pendingInput = message;
        this.armInputTimer(session);
        this.onMessage(message);
      }
      return;
    }
    if (["completed", "runtime-error"].includes(message.type)) this.finish(session, message.type, message);
  }

  deliverInput(session, value) {
    const request = session.pendingInput;
    if (!request || session.completed) return false;
    session.pendingInput = null;
    this.clearInputTimer(session);
    session.iframe.contentWindow.postMessage({ channel: CHANNEL, sessionId: session.sessionId, type: "input-response", requestId: request.requestId, value: value === null ? null : String(value) }, "*");
    this.armComputationTimer(session);
    return true;
  }

  armComputationTimer(session) {
    if (session.completed || session.pendingInput || session.timer) return;
    if (session.remainingMs <= 0) {
      this.finish(session, "timeout", { message: "Execution timed out after the configured computation limit." });
      return;
    }
    session.timerStartedAt = Date.now();
    const timer = window.setTimeout(() => {
      if (session.timer !== timer || this.active?.sessionId !== session.sessionId || session.completed || session.pendingInput) return;
      session.timer = null;
      session.remainingMs = 0;
      this.finish(session, "timeout", { message: "Execution timed out after the configured computation limit." });
    }, session.remainingMs);
    session.timer = timer;
  }

  pauseComputationTimer(session) {
    if (!session.timer) return;
    session.remainingMs = Math.max(0, session.remainingMs - Math.max(0, Date.now() - session.timerStartedAt));
    if (session.timer) window.clearTimeout(session.timer);
    session.timer = null;
    session.timerStartedAt = null;
  }

  armInputTimer(session) {
    if (!session.inputTimeoutMs) return;
    session.inputTimer = window.setTimeout(() => {
      if (this.active?.sessionId !== session.sessionId || session.completed || !session.pendingInput) return;
      this.finish(session, "timeout", { message: `Input was not received after ${session.inputTimeoutMs} ms.` });
    }, session.inputTimeoutMs);
  }

  clearInputTimer(session) {
    if (!session.inputTimer) return;
    window.clearTimeout(session.inputTimer);
    session.inputTimer = null;
  }

  finish(session, type, detail) {
    if (session.completed) return;
    session.completed = true;
    session.pendingInput = null;
    session.queuedInput = [];
    if (session.timer) window.clearTimeout(session.timer);
    this.clearInputTimer(session);
    session.timer = null;
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
  if (!value || typeof value !== "object" || value.channel !== CHANNEL || typeof value.sessionId !== "string") return false;
  if (value.type === "completed") return true;
  if (value.type === "output") return (value.kind === "out" || value.kind === "err") && typeof value.text === "string" && value.text.length <= MAX_OUTPUT_CHARS;
  if (value.type === "input-request") return typeof value.requestId === "string" && /^input-\d+$/.test(value.requestId) && (value.mode === "token" || value.mode === "line");
  return value.type === "runtime-error" && typeof value.message === "string" && value.message.length <= MAX_ERROR_MESSAGE_CHARS;
}

export function sandboxDocument({ sessionId, code, timeoutMs, args }) {
  const executionTimeout = normalizeTimeout(timeoutMs);
  const safeSessionId = String(sessionId);
  const configuration = safeInlineJson({ sessionId: safeSessionId, deadline: Date.now() + executionTimeout, args: safeArgs(args) });
  const sessionLiteral = safeInlineJson(safeSessionId);
  const safeCode = String(code ?? "").replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src 'none'">
<script>
(() => {
  const config = ${configuration};
  const send = (type, detail = {}) => parent.postMessage({ channel: "${CHANNEL}", sessionId: config.sessionId, type, ...detail }, "*");
  let nextInputRequestId = 0;
  let pendingInput = null;
  let computationDeadline = config.deadline;
  const requestInput = (mode) => new Promise((resolve) => {
    if (pendingInput) throw new Error("Only one Scanner input request can be active at a time.");
    const requestId = "input-" + (++nextInputRequestId);
    pendingInput = { requestId, resolve, pausedAt: Date.now() };
    send("input-request", { requestId, mode });
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== parent || !message || message.channel !== "${CHANNEL}" || message.sessionId !== config.sessionId || message.type !== "input-response") return;
    if (!pendingInput || message.requestId !== pendingInput.requestId) return;
    const { resolve, pausedAt } = pendingInput;
    pendingInput = null;
    computationDeadline += Math.max(0, Date.now() - pausedAt);
    resolve(message.value === null ? null : String(message.value));
  });
  const safeErrorMessage = (value) => String(value?.message || value || "Unknown runtime error").slice(0, ${MAX_ERROR_MESSAGE_CHARS});
  let outputSize = 0;
  const MAX_ARRAY_ELEMENTS = ${MAX_ARRAY_ELEMENTS};
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
  const arrayFromInitializer = (values) => {
    if (!Array.isArray(values) || values.length > MAX_ARRAY_ELEMENTS) throw new RangeError("Array allocation exceeds the JavaLab element limit.");
    return values;
  };
  const createArray = (dimensions, type) => createBoundedArray(dimensions, type, { remaining: MAX_ARRAY_ELEMENTS });
  const createBoundedArray = (dimensions, type, budget) => {
    if (!Array.isArray(dimensions)) throw new TypeError("Array dimensions must be an array.");
    const [length = 0, ...rest] = dimensions;
    const safeLength = Math.max(0, toInt(length));
    if (safeLength > budget.remaining) throw new RangeError("Array allocation exceeds the JavaLab element limit.");
    budget.remaining -= safeLength;
    return Array.from({ length: safeLength }, () => rest.length ? createBoundedArray(rest, type, budget) : defaultValue(type));
  };
  const emit = (kind, values, newline) => {
    const text = values.map(javaString).join("") + (newline ? "\\n" : "");
    outputSize += text.length;
    if (outputSize > ${MAX_OUTPUT_CHARS}) throw new Error("Program output exceeded the JavaLab limit.");
    send("output", { kind, text });
  };
  class JavaScanner {
    constructor(request) { this.request = request; this.buffer = ""; this.position = 0; this.closed = false; }
    async next() { const token = await this.readToken(); if (token === null) throw new Error("InputMismatchException: No token is available."); return token; }
    async nextLine() { await this.ensureLine(); if (this.position >= this.buffer.length) return ""; let end = this.position; while (end < this.buffer.length && this.buffer[end] !== "\\n" && this.buffer[end] !== "\\r") end += 1; const value = this.buffer.slice(this.position, end); this.position = end; if (this.buffer[this.position] === "\\r") this.position += 1; if (this.buffer[this.position] === "\\n") this.position += 1; return value; }
    async nextInt() { const value = await this.next(); if (!/^[+-]?\\d+$/.test(value)) throw new Error("InputMismatchException: '" + value + "' is not an int."); const number = Number(value); if (!Number.isSafeInteger(number) || number < -2147483648 || number > 2147483647) throw new Error("InputMismatchException: '" + value + "' is outside the int range."); return number | 0; }
    async nextLong() { const value = await this.next(); if (!/^[+-]?\\d+$/.test(value)) throw new Error("InputMismatchException: '" + value + "' is not a long."); return Number(value); }
    async nextDouble() { const value = Number(await this.next()); if (!Number.isFinite(value)) throw new Error("InputMismatchException: Value is not a double."); return value; }
    async nextFloat() { return this.nextDouble(); }
    async nextBoolean() { const value = (await this.next()).toLowerCase(); if (value !== "true" && value !== "false") throw new Error("InputMismatchException: '" + value + "' is not a boolean."); return value === "true"; }
    async hasNext() { return (await this.readToken(false)) !== null; }
    close() { this.closed = true; }
    async ensureToken() { this.skipWhitespace(); while (this.position >= this.buffer.length && !this.closed) { const value = await this.request("token"); if (value === null) { this.closed = true; break; } this.append(value); this.skipWhitespace(); } }
    async ensureLine() { while (this.position >= this.buffer.length && !this.closed) { const value = await this.request("line"); if (value === null) { this.closed = true; break; } this.append(value); } }
    async readToken(consume = true) { await this.ensureToken(); const start = this.position; while (this.position < this.buffer.length && !/\\s/.test(this.buffer[this.position])) this.position += 1; const token = start === this.position ? null : this.buffer.slice(start, this.position); if (!consume) this.position = start; return token; }
    skipWhitespace() { while (this.position < this.buffer.length && /\\s/.test(this.buffer[this.position])) this.position += 1; }
    append(value) { if (this.position > 0) { this.buffer = this.buffer.slice(this.position); this.position = 0; } this.buffer += value; }
  }
  const javaRuntime = {
    args: config.args,
    print: (...values) => emit("out", values, false),
    println: (...values) => emit("out", values, true),
    error: (...values) => emit("err", values, false),
    errorln: (...values) => emit("err", values, true),
    binary,
    defaultValue,
    createArray,
    arrayFromInitializer,
    stringEquals: (left, right) => String(left) === String(right),
    stringLength: (value) => String(value).length,
    stringContains: (value, search) => String(value).includes(String(search)),
    stringCharAt: (value, index) => { const string = String(value); const position = toInt(index); if (position < 0 || position >= string.length) throw new Error("StringIndexOutOfBoundsException: " + position); return string.charAt(position); },
    stringSubstring: (value, start, end) => { const string = String(value); const from = toInt(start); const to = end === undefined ? string.length : toInt(end); if (from < 0 || to < from || to > string.length) throw new Error("StringIndexOutOfBoundsException"); return string.slice(from, to); },
    stringUpper: (value) => String(value).toUpperCase(),
    stringLower: (value) => String(value).toLowerCase(),
    createScanner: () => new JavaScanner(requestInput),
    scannerCall: async (scanner, method) => { if (!(scanner instanceof JavaScanner) || typeof scanner[method] !== "function") throw new Error("No supported Scanner method named '" + method + "'."); return scanner[method](); },
    math: { E: Math.E, PI: Math.PI, abs: Math.abs, ceil: Math.ceil, cos: Math.cos, floor: Math.floor, max: Math.max, min: Math.min, pow: Math.pow, random: Math.random, round: (value) => Math.floor(Number(value) + 0.5), sin: Math.sin, sqrt: Math.sqrt },
    checkExecution: () => { if (Date.now() > computationDeadline) throw new Error("Execution timed out after the configured limit."); },
    unsupported: (message) => { throw new Error(message); },
  };
  Object.freeze(javaRuntime.math);
  Object.freeze(javaRuntime);
  Object.defineProperty(window, "JavaRuntime", { value: javaRuntime, writable: false, configurable: false });
  window.addEventListener("error", (event) => send("runtime-error", { message: safeErrorMessage(event.error || event.message) }));
  window.addEventListener("unhandledrejection", (event) => send("runtime-error", { message: safeErrorMessage(event.reason) }));
})();
</script>
<script>
(async () => {
try {
await (${safeCode});
parent.postMessage({ channel: "${CHANNEL}", sessionId: ${sessionLiteral}, type: "completed" }, "*");
} catch (error) {
parent.postMessage({ channel: "${CHANNEL}", sessionId: ${sessionLiteral}, type: "runtime-error", message: String(error?.message || error).slice(0, ${MAX_ERROR_MESSAGE_CHARS}) }, "*");
}
})();
</script>`;
}

function normalizeTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  return Number.isFinite(value) ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.floor(value))) : DEFAULT_TIMEOUT_MS;
}

function normalizeInputTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(3_600_000, Math.floor(value));
}

function normalizeInput(value) {
  if (value === null) return null;
  const input = String(value);
  return input.length <= MAX_INPUT_CHARS ? input : null;
}

function safeArgs(args) {
  return Array.isArray(args) ? args.slice(0, 32).map((value) => String(value).slice(0, 1_024)) : [];
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

