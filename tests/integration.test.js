import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compile } from "../js/compiler/compiler.js";
import { createJavaRuntime } from "../js/runtime/runtime.js";

async function runJava(source, input = []) {
  const result = compile(source);
  assert.equal(result.status, "compiled", result.diagnostics.map((item) => item.message).join("\n"));
  const output = [];
  const values = [...input];
  const runtime = createJavaRuntime({ onOutput: (entry) => output.push(entry.text), requestInput: async () => values.length ? values.shift() : null });
  await vm.runInNewContext(result.generatedJavaScript, { JavaRuntime: runtime }, { timeout: 1000 });
  return { result, output: output.join("") };
}

test("end-to-end compiler pipeline translates and runs Hello World", async () => {
  const { result, output } = await runJava(`public class Main {
    public static void main(String[] args) {
      System.out.println("Hello, JavaLab!");
    }
  }`);
  assert.match(result.generatedJavaScript, /JavaRuntime\.println/);
  assert.equal(output, "Hello, JavaLab!\n");
});

test("end-to-end pipeline preserves integer arithmetic, loops, arrays, and methods", async () => {
  const { output } = await runJava(`public class Main {
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


test("end-to-end pipeline reads Scanner input and uses String and Math helpers", async () => {
  const { output } = await runJava(`import java.util.Scanner;
  public class Main {
    public static void main(String[] args) {
      Scanner scanner = new Scanner(System.in);
      int score = scanner.nextInt();
      String name = scanner.nextLine().substring(1).toUpperCase();
      System.out.println(name + ": " + Math.max(score, 10));
    }
  }`, ["7 ada lovelace\n"]);
  assert.equal(output, "ADA LOVELACE: 10\n");
});
