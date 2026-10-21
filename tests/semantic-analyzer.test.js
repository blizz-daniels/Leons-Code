import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/compiler/compiler.js";

test("semantic analysis reports an undefined variable with a source location", () => {
  const result = compile("class Main { void run() { int answer = missing; } }");
  const diagnostic = result.diagnostics.find((item) => item.code === "SEM_UNDEFINED_NAME");
  assert.equal(result.status, "error");
  assert.ok(diagnostic);
  assert.equal(diagnostic.start.line, 1);
  assert.match(diagnostic.message, /missing/);
});

test("semantic analysis rejects incompatible assignments and non-boolean conditions", () => {
  const result = compile("class Main { void run() { int count = true; if (count) { } } }");
  assert.equal(result.status, "error");
  assert.ok(result.diagnostics.some((item) => item.code === "SEM_INCOMPATIBLE_TYPES"));
  assert.ok(result.diagnostics.some((item) => item.code === "SEM_EXPECTED_BOOLEAN"));
});

test("semantic analysis validates calls to methods declared in the current class", () => {
  const result = compile("class Main { static int twice(int value) { return value * 2; } static void main(String[] args) { System.out.println(twice()); } }");
  assert.equal(result.status, "error");
  assert.ok(result.diagnostics.some((item) => item.code === "SEM_ARGUMENT_COUNT"));
});

