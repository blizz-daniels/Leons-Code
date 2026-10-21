import { createDiagnostic } from "./diagnostics.js";

const KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue",
  "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "if",
  "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private",
  "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while",
]);

const BOOLEAN_LITERALS = new Set(["true", "false"]);
const MULTI_CHAR_OPERATORS = [">>>=", "<<=", ">>=", ">>>", "<<", ">>", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "->", "::"];
const SINGLE_CHAR_OPERATORS = new Set(["+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~"]);
const SEPARATORS = new Set(["(", ")", "{", "}", "[", "]", ";", ",", ".", ":", "?", "@"]); 

export function lex(source) {
  const scanner = new Lexer(source);
  return scanner.scan();
}

export class Lexer {
  constructor(source) {
    this.source = source.replace(/\r\n?/g, "\n");
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.diagnostics = [];
  }

  scan() {
    while (!this.atEnd()) {
      const character = this.peek();
      if (isWhitespace(character)) {
        this.advance();
      } else if (character === "/" && this.peek(1) === "/") {
        this.skipLineComment();
      } else if (character === "/" && this.peek(1) === "*") {
        this.skipBlockComment();
      } else if (isIdentifierStart(character)) {
        this.scanIdentifier();
      } else if (isDigit(character) || (character === "." && isDigit(this.peek(1)))) {
        this.scanNumber();
      } else if (character === '"') {
        this.scanQuotedLiteral('"', "STRING_LITERAL");
      } else if (character === "'") {
        this.scanQuotedLiteral("'", "CHAR_LITERAL");
      } else if (this.scanOperator()) {
        // The operator was emitted by scanOperator.
      } else if (SEPARATORS.has(character)) {
        const start = this.position();
        this.advance();
        this.emit("SEPARATOR", character, start);
      } else {
        const start = this.position();
        const invalid = this.advance();
        this.error("LEX_UNEXPECTED_CHARACTER", `Unexpected character '${invalid}'.`, start);
      }
    }

    const eof = this.position();
    this.tokens.push({ type: "EOF", lexeme: "", value: null, start: eof, end: eof });
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  scanIdentifier() {
    const start = this.position();
    let lexeme = this.advance();
    while (isIdentifierPart(this.peek())) lexeme += this.advance();

    if (BOOLEAN_LITERALS.has(lexeme)) {
      this.emit("BOOLEAN_LITERAL", lexeme, start, lexeme === "true");
    } else if (lexeme === "null") {
      this.emit("NULL_LITERAL", lexeme, start, null);
    } else if (KEYWORDS.has(lexeme)) {
      this.emit("KEYWORD", lexeme, start);
    } else {
      this.emit("IDENTIFIER", lexeme, start);
    }
  }

  scanNumber() {
    const start = this.position();
    let lexeme = "";
    let kind = "INTEGER_LITERAL";

    if (this.peek() === "0" && /[xX]/.test(this.peek(1))) {
      lexeme += this.advance() + this.advance();
      const digitsStart = this.index;
      while (isHexDigit(this.peek()) || this.peek() === "_") lexeme += this.advance();
      if (this.index === digitsStart) this.error("LEX_MALFORMED_NUMBER", "Expected hexadecimal digits after 0x.", start);
    } else if (this.peek() === "0" && /[bB]/.test(this.peek(1))) {
      lexeme += this.advance() + this.advance();
      const digitsStart = this.index;
      while (/[01_]/.test(this.peek())) lexeme += this.advance();
      if (this.index === digitsStart) this.error("LEX_MALFORMED_NUMBER", "Expected binary digits after 0b.", start);
    } else {
      while (isDigit(this.peek()) || this.peek() === "_") lexeme += this.advance();
      if (this.peek() === "." && this.peek(1) !== ".") {
        kind = "FLOAT_LITERAL";
        lexeme += this.advance();
        while (isDigit(this.peek()) || this.peek() === "_") lexeme += this.advance();
      }
      if (/[eE]/.test(this.peek())) {
        kind = "FLOAT_LITERAL";
        lexeme += this.advance();
        if (/[+-]/.test(this.peek())) lexeme += this.advance();
        const exponentStart = this.index;
        while (isDigit(this.peek()) || this.peek() === "_") lexeme += this.advance();
        if (this.index === exponentStart) this.error("LEX_MALFORMED_NUMBER", "Expected exponent digits after scientific notation marker.", start);
      }
    }

    if (/[fFdD]/.test(this.peek())) {
      kind = "FLOAT_LITERAL";
      lexeme += this.advance();
    } else if (/[lL]/.test(this.peek())) {
      lexeme += this.advance();
    }
    this.emit(kind, lexeme, start, numericValue(lexeme));
  }

  scanQuotedLiteral(quote, type) {
    const start = this.position();
    let lexeme = this.advance();
    let value = "";
    let terminated = false;

    while (!this.atEnd()) {
      const character = this.advance();
      lexeme += character;
      if (character === quote) {
        terminated = true;
        break;
      }
      if (character === "\n") {
        this.error("LEX_UNTERMINATED_LITERAL", `Unterminated ${type === "STRING_LITERAL" ? "string" : "character"} literal.`, start);
        break;
      }
      if (character === "\\") {
        if (this.atEnd()) break;
        const escape = this.advance();
        lexeme += escape;
        const decoded = decodeEscape(escape);
        if (decoded === null) {
          this.error("LEX_INVALID_ESCAPE", `Invalid escape sequence \\${escape}.`, this.positionBefore(2));
          value += escape;
        } else {
          value += decoded;
        }
      } else {
        value += character;
      }
    }

    if (!terminated && !this.diagnostics.some((item) => item.start.offset === start.offset && item.code === "LEX_UNTERMINATED_LITERAL")) {
      this.error("LEX_UNTERMINATED_LITERAL", `Unterminated ${type === "STRING_LITERAL" ? "string" : "character"} literal.`, start);
    }
    if (type === "CHAR_LITERAL" && terminated && [...value].length !== 1) {
      this.error("LEX_INVALID_CHAR", "Character literals must contain exactly one character.", start);
    }
    this.emit(type, lexeme, start, value);
  }

  skipLineComment() {
    this.advance();
    this.advance();
    while (!this.atEnd() && this.peek() !== "\n") this.advance();
  }

  skipBlockComment() {
    const start = this.position();
    this.advance();
    this.advance();
    while (!this.atEnd() && !(this.peek() === "*" && this.peek(1) === "/")) this.advance();
    if (this.atEnd()) {
      this.error("LEX_UNTERMINATED_COMMENT", "Unterminated block comment.", start);
      return;
    }
    this.advance();
    this.advance();
  }

  scanOperator() {
    const start = this.position();
    const candidate = MULTI_CHAR_OPERATORS.find((operator) => this.source.startsWith(operator, this.index));
    if (candidate) {
      for (let index = 0; index < candidate.length; index += 1) this.advance();
      this.emit("OPERATOR", candidate, start);
      return true;
    }
    if (SINGLE_CHAR_OPERATORS.has(this.peek())) {
      const operator = this.advance();
      this.emit("OPERATOR", operator, start);
      return true;
    }
    return false;
  }

  emit(type, lexeme, start, value = lexeme) {
    this.tokens.push({ type, lexeme, value, start, end: this.position() });
  }

  error(code, message, start) {
    this.diagnostics.push(createDiagnostic({ phase: "lexer", code, message, start, end: this.position() }));
  }

  atEnd() { return this.index >= this.source.length; }
  peek(offset = 0) { return this.source[this.index + offset] || ""; }
  position() { return { line: this.line, column: this.column, offset: this.index }; }
  positionBefore(length) { return { line: this.line, column: Math.max(1, this.column - length), offset: Math.max(0, this.index - length) }; }
  advance() {
    const character = this.source[this.index] || "";
    this.index += 1;
    if (character === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return character;
  }
}

function isWhitespace(character) { return /\s/.test(character); }
function isIdentifierStart(character) { return /[A-Za-z_$]/.test(character); }
function isIdentifierPart(character) { return /[A-Za-z0-9_$]/.test(character); }
function isDigit(character) { return /[0-9]/.test(character); }
function isHexDigit(character) { return /[0-9a-fA-F]/.test(character); }

function numericValue(lexeme) {
  const normalized = lexeme.replace(/_/g, "").replace(/[fFdDlL]$/, "");
  if (/^0[xX]/.test(normalized)) return Number.parseInt(normalized.slice(2), 16);
  if (/^0[bB]/.test(normalized)) return Number.parseInt(normalized.slice(2), 2);
  return Number(normalized);
}

function decodeEscape(character) {
  return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "'": "'", '"': '"', 0: "\0" })[character] ?? null;
}

