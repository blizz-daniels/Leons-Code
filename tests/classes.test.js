import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compile } from "../js/compiler/compiler.js";
import { createJavaRuntime } from "../js/runtime/runtime.js";

test("translated classes, constructors, fields, and inheritance execute together", () => {
  const source = `class Person {
    String name;
    Person(String name) { this.name = name; }
    String greeting() { return "Hello, " + name; }
  }
  class Student extends Person {
    Student(String name) { super(name); }
  }
  public class Main {
    public static void main(String[] args) {
      Student student = new Student("Ada");
      System.out.println(student.greeting());
    }
  }`;
  const result = compile(source);
  assert.equal(result.status, "compiled", result.diagnostics.map((item) => item.message).join("\n"));
  const output = [];
  vm.runInNewContext(result.generatedJavaScript, {
    JavaRuntime: createJavaRuntime({ onOutput: (entry) => output.push(entry.text) }),
  });
  assert.equal(output.join(""), "Hello, Ada\n");
});

