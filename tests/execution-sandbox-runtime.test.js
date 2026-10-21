import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { sandboxDocument } from "../js/runtime/execution-engine.js";

test("sandbox Scanner request resumes generated asynchronous code", async () => {
  const html = sandboxDocument({
    sessionId: "test-session",
    timeoutMs: 1000,
    args: [],
    code: "(async () => { const scanner = JavaRuntime.createScanner(); JavaRuntime.println(await JavaRuntime.scannerCall(scanner, \"nextInt\")); })()",
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
  new vm.Script(scripts[1]).runInContext(context);
  await Promise.resolve();
  assert.equal(Object.isFrozen(context.JavaRuntime), true);
  const request = messages.find((message) => message.type === "input-request");
  assert.ok(request);
  listeners.message({
    source: context.parent,
    data: { channel: "javalab-execution-v1", sessionId: "test-session", type: "input-response", requestId: request.requestId, value: "42" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(messages.map((message) => message.type), ["input-request", "output", "completed"]);
  assert.equal(messages[1].text, "42\n");
});
