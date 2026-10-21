import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/compiler/compiler.js";
import { STARTER_EXAMPLES } from "../js/ui/examples-panel.js";
import { createLocalProjectStore, safeFilename } from "../js/storage/local-projects.js";

test("all Phase 5 starter examples compile against the supported subset", () => {
  assert.equal(STARTER_EXAMPLES.length, 15);
  for (const example of STARTER_EXAMPLES) {
    const result = compile(example.source);
    assert.equal(result.status, "compiled", `${example.name}: ${result.diagnostics.map((item) => item.message).join("; ")}`);
  }
});

test("local project store saves, lists, and removes browser projects", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const store = createLocalProjectStore(storage);
  const project = store.save({ id: "one", name: "Practice", filename: "Practice", source: "class Main {}" });
  assert.equal(project.filename, "Practice.java");
  assert.equal(store.list()[0].name, "Practice");
  const updated = store.save({ ...project, source: "class Main { }" });
  assert.equal(updated.id, "one");
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].source, "class Main { }");
  assert.equal(store.remove("one"), true);
  assert.equal(store.list().length, 0);
  assert.equal(safeFilename("hello world"), "hello-world.java");
});

test("local project storage failure does not expose saved project data", () => {
  const store = createLocalProjectStore({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  assert.deepEqual(store.list(), []);
  assert.throws(() => store.save({ id: "blocked", name: "Blocked", filename: "Main.java", source: "" }), /storage is unavailable/);
});
