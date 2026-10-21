import test from "node:test";
import assert from "node:assert/strict";
import { createEditorState, isDirty, markSaved, redo, undo, updateSource } from "../js/editor/editor-state.js";

test("a fresh editor state is saved", () => {
  assert.equal(isDirty(createEditorState({ source: "class Main {}" })), false);
});

test("source changes are dirty and can be marked saved", () => {
  let state = createEditorState({ source: "class Main {}" });
  state = updateSource(state, "class Main { int value; }");
  assert.equal(isDirty(state), true);
  assert.equal(isDirty(markSaved(state)), false);
});

test("undo and redo restore source history", () => {
  let state = createEditorState({ source: "a" });
  state = updateSource(state, "ab");
  state = updateSource(state, "abc");
  assert.equal(undo(state).source, "ab");
  assert.equal(redo(undo(state)).source, "abc");
});

