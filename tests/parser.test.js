import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/compiler/compiler.js";

const HELLO_WORLD = `
package classroom.examples;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, JavaLab!");
    }
}
`;

test("parser builds a compilation unit, class, method, and call expression", () => {
  const result = compile(HELLO_WORLD);
  assert.equal(result.status, "compiled");
  assert.equal(result.ast.packageDeclaration.name, "classroom.examples");
  assert.equal(result.ast.imports[0].name, "java.util.Scanner");
  const mainClass = result.ast.declarations[0];
  const mainMethod = mainClass.members[0];
  assert.equal(mainClass.type, "ClassDeclaration");
  assert.equal(mainMethod.name, "main");
  assert.equal(mainMethod.parameters[0].parameterType.arrayDimensions, 1);
  assert.equal(mainMethod.body.statements[0].expression.type, "CallExpression");
  assert.equal(mainMethod.body.statements[0].expression.callee.property, "println");
});

test("parser preserves arithmetic precedence and parenthesized expressions", () => {
  const result = compile(`class Main { void run() { int value = 2 + 3 * (4 - 1); } }`);
  assert.equal(result.status, "compiled");
  const initializer = result.ast.declarations[0].members[0].body.statements[0].declarators[0].initializer;
  assert.equal(initializer.operator, "+");
  assert.equal(initializer.right.operator, "*");
  assert.equal(initializer.right.right.type, "ParenthesizedExpression");
  assert.deepEqual(initializer.loc.end, { line: 1, column: 53, offset: 52 });
});

test("parser handles control flow, arrays, and object construction syntax", () => {
  const result = compile(`class Main {
    void run() {
      int[] values = new int[] { 1, 2, 3 };
      for (int value : values) { if (value > 1) { break; } }
      while (values[0] > 0) values[0]--;
    }
  }`);
  assert.equal(result.status, "compiled");
  const statements = result.ast.declarations[0].members[0].body.statements;
  assert.equal(statements[0].declarators[0].initializer.type, "NewArrayExpression");
  assert.equal(statements[1].type, "EnhancedForStatement");
  assert.equal(statements[2].type, "WhileStatement");
});

test("parser produces a located diagnostic for a missing semicolon", () => {
  const result = compile(`class Main { void run() { int value = 1 } }`);
  assert.equal(result.status, "error");
  const diagnostic = result.diagnostics.find((item) => item.code === "PARSE_EXPECTED_TOKEN");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /Expected ';'/);
  assert.deepEqual(diagnostic.start, { line: 1, column: 41, offset: 40 });
});

test("unsupported generic syntax is reported as an explicit warning", () => {
  const result = compile("class Main { java.util.List<String> names; }");
  assert.equal(result.status, "error");
  assert.equal(result.unsupportedFeatures[0].code, "PARSE_UNSUPPORTED_GENERIC");
});

