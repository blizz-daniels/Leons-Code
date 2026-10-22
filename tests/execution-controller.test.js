import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine } from "../js/runtime/execution-engine.js";

test("execution controller rejects malformed messages and stops a live session", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const listeners = new Map();
  const timers = [];
  const attributes = new Map();
  const delivered = [];
  let removed = false;
  const iframe = {
    contentWindow: { postMessage: (message) => delivered.push(message) },
    setAttribute: (name, value) => attributes.set(name, value),
    remove: () => { removed = true; },
  };

  globalThis.window = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cleared = true; },
  };
  globalThis.document = { createElement: () => iframe, body: { append: () => {} } };

  try {
    const messages = [];
    const engine = new ExecutionEngine({ onMessage: (message) => messages.push(message) });
    const sessionId = engine.run({ code: "(async () => {})()", metadata: {}, timeoutMs: 1 });
    assert.equal(attributes.get("sandbox"), "allow-scripts");
    assert.equal(iframe.referrerPolicy, "no-referrer");
    assert.equal(timers[0].delay, 100);

    engine.handleMessage({ source: iframe.contentWindow, data: { channel: "javalab-execution-v1", sessionId, type: "output", kind: "other", text: "ignored" } });
    engine.handleMessage({ source: {}, data: { channel: "javalab-execution-v1", sessionId, type: "output", kind: "out", text: "ignored" } });
    assert.deepEqual(messages.map((message) => message.type), ["started"]);

    assert.equal(engine.provideInput("x".repeat(65_537)), "too-large");
    assert.equal(engine.provideInput("42"), "queued");
    engine.handleMessage({ source: iframe.contentWindow, data: { channel: "javalab-execution-v1", sessionId, type: "input-request", requestId: "input-1", mode: "token" } });
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].value, "42");
    assert.equal(timers[0].cleared, true);
    assert.equal(timers[1].delay <= 100, true);

    assert.equal(engine.stop(), true);
    assert.equal(removed, true);
    assert.equal(timers[0].cleared, true);
    assert.deepEqual(messages.map((message) => message.type), ["started", "stopped"]);
    engine.destroy();
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});

test("execution controller pauses computation time for Scanner input and Stop cancels the pending request", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const timers = [];
  const delivered = [];
  let removed = false;
  const iframe = {
    contentWindow: { postMessage: (message) => delivered.push(message) },
    setAttribute: () => {},
    remove: () => { removed = true; },
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cleared = true; },
  };
  globalThis.document = { createElement: () => iframe, body: { append: () => {} } };

  try {
    const messages = [];
    const engine = new ExecutionEngine({ onMessage: (message) => messages.push(message) });
    const sessionId = engine.run({ code: "(async () => {})()", metadata: {}, timeoutMs: 500, inputTimeoutMs: 250 });
    const computationTimer = timers[0];
    engine.handleMessage({ source: iframe.contentWindow, data: { channel: "javalab-execution-v1", sessionId, type: "input-request", requestId: "input-1", mode: "line" } });
    assert.equal(computationTimer.cleared, true);
    assert.equal(timers[1].delay, 250);
    assert.equal(messages.at(-1).type, "input-request");

    computationTimer.callback();
    assert.equal(messages.at(-1).type, "input-request");
    assert.equal(engine.provideInput("Ada\n"), "sent");
    assert.equal(delivered.at(-1).value, "Ada\n");
    assert.equal(timers[1].cleared, true);
    assert.equal(timers[2].delay <= 500, true);

    engine.handleMessage({ source: iframe.contentWindow, data: { channel: "javalab-execution-v1", sessionId, type: "input-request", requestId: "input-2", mode: "token" } });
    assert.equal(engine.stop(), true);
    assert.equal(removed, true);
    assert.equal(engine.active, null);
    assert.equal(messages.at(-1).type, "stopped");
    engine.destroy();
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});

test("execution controller enforces its parent-side output cap and timeout cleanup", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const timers = [];
  let removed = false;
  const iframe = {
    contentWindow: { postMessage: () => {} },
    setAttribute: () => {},
    remove: () => { removed = true; },
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cleared = true; },
  };
  globalThis.document = { createElement: () => iframe, body: { append: () => {} } };

  try {
    const messages = [];
    const engine = new ExecutionEngine({ onMessage: (message) => messages.push(message) });
    const sessionId = engine.run({ code: "(async () => {})()", metadata: {}, timeoutMs: 500 });
    const event = (data) => engine.handleMessage({ source: iframe.contentWindow, data });
    event({ channel: "javalab-execution-v1", sessionId, type: "output", kind: "out", text: "x".repeat(6_000) });
    event({ channel: "javalab-execution-v1", sessionId, type: "output", kind: "out", text: "x".repeat(5_000) });
    assert.equal(removed, true);
    assert.equal(messages.at(-1).type, "runtime-error");

    removed = false;
    engine.run({ code: "(async () => {})()", metadata: {}, timeoutMs: 500 });
    timers.at(-1).callback();
    assert.equal(removed, true);
    assert.equal(messages.at(-1).type, "timeout");
    engine.destroy();
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
