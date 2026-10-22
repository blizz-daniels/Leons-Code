import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { sandboxDocument } from "../js/runtime/execution-engine.js";

function createSandbox({ code, timeoutMs = 1000 }) {
  const html = sandboxDocument({
    sessionId: "test-session",
    timeoutMs,
    args: [],
    code,
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const messages = [];
  const listeners = {};
  const context = {
    parent: { postMessage: (message) => messages.push(message) },
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
  context.window = context;
  vm.createContext(context);
  new vm.Script(scripts[0]).runInContext(context);
  return { context, listeners, messages, run: (options) => new vm.Script(scripts[1]).runInContext(context, options) };
}

function sendInput(sandbox, value) {
  const request = sandbox.messages.filter((message) => message.type === "input-request").at(-1);
  assert.ok(request, "expected Scanner to request input");
  sandbox.listeners.message({
    source: sandbox.context.parent,
    data: { channel: "javalab-execution-v1", sessionId: "test-session", type: "input-response", requestId: request.requestId, value },
  });
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("sandbox Scanner request resumes generated asynchronous code", async () => {
  const sandbox = createSandbox({
    code: "(async () => { const scanner = JavaRuntime.createScanner(); JavaRuntime.println(await JavaRuntime.scannerCall(scanner, \"nextInt\")); })()",
  });
  sandbox.run();
  await Promise.resolve();
  assert.equal(Object.isFrozen(sandbox.context.JavaRuntime), true);
  sendInput(sandbox, "42\n");
  await flush();
  assert.deepEqual(sandbox.messages.map((message) => message.type), ["input-request", "output", "completed"]);
  assert.equal(sandbox.messages[1].text, "42\n");
});

test("sandbox keeps Scanner continuations alive beyond the computation deadline", async () => {
  const sandbox = createSandbox({
    timeoutMs: 100,
    code: "(async () => { const scanner = JavaRuntime.createScanner(); const name = await JavaRuntime.scannerCall(scanner, \"nextLine\"); JavaRuntime.checkExecution(); JavaRuntime.println(\"Hello, \" + name); })()",
  });
  sandbox.run();
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 130));
  sendInput(sandbox, "Ada\n");
  await flush();
  assert.deepEqual(sandbox.messages.map((message) => message.type), ["input-request", "output", "completed"]);
  assert.equal(sandbox.messages[1].text, "Hello, Ada\n");
});

test("sandbox preserves variables across multiple Scanner requests, empty lines, and token-to-line input", async () => {
  const sandbox = createSandbox({
    code: "(async () => { const scanner = JavaRuntime.createScanner(); const name = await JavaRuntime.scannerCall(scanner, \"nextLine\"); const score = await JavaRuntime.scannerCall(scanner, \"nextInt\"); const afterScore = await JavaRuntime.scannerCall(scanner, \"nextLine\"); const empty = await JavaRuntime.scannerCall(scanner, \"nextLine\"); JavaRuntime.println(name + \":\" + score + \":\" + afterScore + \":\" + empty); })()",
  });
  sandbox.run();
  await flush();
  sendInput(sandbox, "Ada\n");
  await flush();
  sendInput(sandbox, "7\n");
  await flush();
  sendInput(sandbox, "\n");
  await flush();
  assert.deepEqual(sandbox.messages.map((message) => message.type), ["input-request", "input-request", "input-request", "output", "completed"]);
  assert.equal(sandbox.messages.at(-2).text, "Ada:7::\n");
});

test("sandbox execution guard terminates an actual infinite loop", () => {
  const sandbox = createSandbox({
    timeoutMs: 100,
    code: "(() => { while (true) JavaRuntime.checkExecution(); })()",
  });
  sandbox.run({ timeout: 500 });
  const error = sandbox.messages.find((message) => message.type === "runtime-error");
  assert.match(error?.message || "", /timed out/);
});
