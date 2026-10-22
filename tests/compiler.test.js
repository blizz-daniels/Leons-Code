import test from "node:test";
import assert from "node:assert/strict";
import { compile, MAX_SOURCE_LENGTH, validateGeneratedJavaScript } from "../js/compiler/compiler.js";

test("compiler facade returns tokens, AST, diagnostics, and feature support", () => {
  const result = compile("public class Main {}");
  assert.equal(result.status, "compiled");
  assert.equal(result.tokens.at(-1).type, "EOF");
  assert.equal(result.ast.type, "CompilationUnit");
  assert.match(result.generatedJavaScript, /class Main/);
  assert.equal(result.featureSupport.version, "0.6.0");
});

test("compiler facade does not claim malformed source was parsed", () => {
  const result = compile("class Main { void run( {");
  assert.equal(result.status, "error");
  assert.ok(result.diagnostics.some((item) => item.severity === "error"));
  assert.equal(result.generatedJavaScript, null);
});
test("compiler rejects oversized source before lexing", () => {
  const result = compile("x".repeat(MAX_SOURCE_LENGTH + 1));
  assert.equal(result.status, "error");
  assert.equal(result.stage, "input");
  assert.equal(result.generatedJavaScript, null);
  assert.equal(result.diagnostics[0].code, "COMP_SOURCE_TOO_LARGE");
});

test("generated JavaScript must pass syntax validation before it is runnable", () => {
  assert.equal(validateGeneratedJavaScript("(async () => { return 1; })()"), null);
  const diagnostic = validateGeneratedJavaScript("(async () => { const = 1; })()");
  assert.equal(diagnostic.code, "TRANSLATE_INVALID_JAVASCRIPT");
  assert.match(diagnostic.message, /syntax validation/i);
});

