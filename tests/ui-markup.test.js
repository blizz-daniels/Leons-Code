import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("top-bar actions are separate buttons and editor text remains visible", async () => {
  const [page, editorStyles] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/editor.css", import.meta.url), "utf8"),
  ]);
  const examplesIndex = page.indexOf('id="examples-button"');
  const saveIndex = page.indexOf('id="save-project-button"');
  assert.ok(examplesIndex >= 0 && examplesIndex < saveIndex);
  assert.match(editorStyles, /\.editor-input \{[^}]*color: var\(--text\)/);
  assert.doesNotMatch(editorStyles, /-webkit-text-fill-color: transparent/);
});
