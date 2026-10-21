import test from "node:test";
import assert from "node:assert/strict";
import { lex } from "../js/compiler/lexer.js";

test("lexer produces positioned Java tokens and skips comments", () => {
  const result = lex("// a comment\nint total = 42;");
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.tokens.slice(0, -1).map((token) => [token.type, token.lexeme]), [
    ["KEYWORD", "int"],
    ["IDENTIFIER", "total"],
    ["OPERATOR", "="],
    ["INTEGER_LITERAL", "42"],
    ["SEPARATOR", ";"],
  ]);
  assert.deepEqual(result.tokens[1].start, { line: 2, column: 5, offset: 17 });
});

test("lexer decodes escaped string and character literals", () => {
  const result = lex('String message = "line\\ntext"; char letter = \'A\';');
  const values = result.tokens.filter((token) => token.type.endsWith("LITERAL")).map((token) => token.value);
  assert.deepEqual(values, ["line\ntext", "A"]);
  assert.equal(result.diagnostics.length, 0);
});

test("lexer reports unterminated comments and malformed literals", () => {
  const result = lex("/* missing\nchar letter = 'xy';");
  assert.equal(result.diagnostics[0].code, "LEX_UNTERMINATED_COMMENT");

  const charResult = lex("char letter = 'xy';");
  assert.equal(charResult.diagnostics[0].code, "LEX_INVALID_CHAR");
  assert.deepEqual(charResult.diagnostics[0].start, { line: 1, column: 15, offset: 14 });
});

test("lexer recognizes the longest available operator", () => {
  const operators = lex("value >>>= 1;").tokens.filter((token) => token.type === "OPERATOR");
  assert.deepEqual(operators.map((token) => token.lexeme), [">>>="]);
});

