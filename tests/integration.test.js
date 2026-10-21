import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compile } from "../js/compiler/compiler.js";
import { createJavaRuntime } from "../js/runtime/runtime.js";

function runJava(source) {
  const result = compile(source);
  assert.equal(result.status, "compiled", result.diagnostics.map((item) => item.message).join("\n"));
  const output = [];
  const runtime = createJavaRuntime({ onOutput: (entry) => output.push(entry.text) });
  vm.runInNewContext(result.generatedJavaScript, { JavaRuntime: runtime }, { timeout: 1000 });
  return { result, output: output.join("") };
}

test("end-to-end compiler pipeline translates and runs Hello World", () => {
  const { result, output } = runJava(`public class Main {
    public static void main(String[] args) {
      System.out.println("Hello, JavaLab!");
    }
  }`);
  assert.match(result.generatedJavaScript, /JavaRuntime\.println/);
  assert.equal(output, "Hello, JavaLab!\n");
});

test("end-to-end pipeline preserves integer arithmetic, loops, arrays, and methods", () => {
  const { output } = runJava(`public class Main {
    static int doubleIt(int value) { return value * 2; }
    public static void main(String[] args) {
      int[] values = new int[] { 3, 4, 5 };
      int total = 0;
      for (int value : values) { total = total + value; }
      System.out.println(doubleIt(total / 2));
    }
  }`);
  assert.equal(output, "12\n");
});

test("compilation errors prevent generated code from being returned", () => {
  const result = compile("class Main { static void main(String[] args) { int value = unknown; } }");
  assert.equal(result.status, "error");
  assert.equal(result.generatedJavaScript, null);
});

