import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, highlightJava } from "../js/editor/syntax-highlighting.js";

test("escaping source prevents HTML from entering highlighted output", () => {
  assert.equal(escapeHtml("<script>&'\""), "&lt;script&gt;&amp;&#039;&quot;");
});

test("Java keywords, strings, and comments receive syntax classes", () => {
  const highlighted = highlightJava('public class Main { // hello\nString value = "<safe>"; }');
  assert.match(highlighted, /token-keyword">public/);
  assert.match(highlighted, /token-comment">\/\/ hello/);
  assert.match(highlighted, /token-string">&quot;&lt;safe&gt;&quot;/);
});

