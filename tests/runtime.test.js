import test from "node:test";
import assert from "node:assert/strict";
import { binary, createArray, createJavaRuntime, javaString, MAX_ARRAY_ELEMENTS } from "../js/runtime/runtime.js";

test("runtime implements Java-style integer division and overflow-sized int arithmetic", () => {
  assert.equal(binary("/", -7, 2, "int"), -3);
  assert.equal(binary("+", 2_147_483_647, 1, "int"), -2_147_483_648);
  assert.throws(() => binary("/", 1, 0, "int"), /ArithmeticException/);
});

test("runtime converts strings and creates typed default arrays", () => {
  assert.equal(javaString(null), "null");
  assert.equal(javaString(false), "false");
  assert.deepEqual(createArray([2, 2], "int"), [[0, 0], [0, 0]]);
});

test("runtime streams output and limits excessive output", () => {
  const output = [];
  const runtime = createJavaRuntime({ onOutput: (entry) => output.push(entry), maxOutput: 5 });
  runtime.println("Hi");
  assert.deepEqual(output, [{ kind: "out", text: "Hi\n" }]);
  assert.throws(() => runtime.println("toolong"), /output exceeded/);
});


test("runtime rejects oversized and multiply nested array allocations", () => {
  assert.throws(() => createArray([MAX_ARRAY_ELEMENTS + 1], "int"), /element limit/);
  assert.throws(() => createArray([500, 500], "int"), /element limit/);
});
