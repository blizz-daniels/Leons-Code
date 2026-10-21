import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { sandboxDocument } from "../js/runtime/execution-engine.js";

test("sandbox document contains syntactically valid Scanner and async execution scripts", () => {
  const html = sandboxDocument({
    sessionId: "test-session",
    timeoutMs: 1000,
    args: [],
    code: "(async () => { JavaRuntime.println(\"ok\"); })()",
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  scripts.forEach((source) => new vm.Script(source));
  assert.match(scripts[0], /class JavaScanner/);
  assert.match(scripts[1], /await \(/);

test("sandbox document keeps generated source inside the execution boundary", () => {
  const html = sandboxDocument({
    sessionId: 'session-</script><script>escaped()</script>',
    timeoutMs: Infinity,
    args: Array.from({ length: 40 }, () => "argument"),
    code: '(async () => { JavaRuntime.println("</script><img src=x>"); })()',
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /worker-src 'none'/);
  assert.doesNotMatch(html, /<\/script><img/);
  scripts.forEach((source) => new vm.Script(source));
});
});
