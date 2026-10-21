import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/compiler/compiler.js";

test("compiler facade returns tokens, AST, diagnostics, and feature support", () => {
  const result = compile("public class Main {}");
  assert.equal(result.status, "compiled");
  assert.equal(result.tokens.at(-1).type, "EOF");
  assert.equal(result.ast.type, "CompilationUnit");
  assert.match(result.generatedJavaScript, /class Main/);
  assert.equal(result.featureSupport.version, "0.3.0");
});

test("compiler facade does not claim malformed source was parsed", () => {
  const result = compile("class Main { void run( {");
  assert.equal(result.status, "error");
  assert.ok(result.diagnostics.some((item) => item.severity === "error"));
  assert.equal(result.generatedJavaScript, null);
});

