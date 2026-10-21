import { createNode, endFrom } from "./ast.js";
import { createDiagnostic } from "./diagnostics.js";

const MODIFIERS = new Set(["public", "protected", "private", "static", "final", "abstract", "native", "synchronized", "transient", "volatile", "strictfp"]);
const PRIMITIVE_TYPES = new Set(["byte", "short", "int", "long", "float", "double", "char", "boolean"]);
const ASSIGNMENT_OPERATORS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", ">>>="]);

export function parse(tokens) {
  return new Parser(tokens).parseCompilationUnit();
}

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.diagnostics = [];
  }

  parseCompilationUnit() {
    const start = this.current();
    let packageDeclaration = null;
    const imports = [];
    const declarations = [];

    if (this.matchKeyword("package")) packageDeclaration = this.parsePackageDeclaration(this.previous());
    while (this.matchKeyword("import")) imports.push(this.parseImportDeclaration(this.previous()));

    while (!this.isAtEnd()) {
      const declaration = this.parseTopLevelDeclaration();
      if (declaration) declarations.push(declaration);
      else this.synchronizeTopLevel();
    }
    return {
      ast: createNode("CompilationUnit", start, this.previous() || start, { packageDeclaration, imports, declarations }),
      diagnostics: this.diagnostics,
    };
  }

  parsePackageDeclaration(start) {
    const name = this.parseQualifiedName("package name");
    const end = this.expectLexeme(";", "Expected ';' after package declaration.");
    return createNode("PackageDeclaration", start, end, { name });
  }

  parseImportDeclaration(start) {
    const isStatic = this.matchKeyword("static");
    const parts = [];
    const first = this.expectIdentifier("Expected an imported type name.");
    if (first) parts.push(first.lexeme);
    while (this.matchLexeme(".")) {
      if (this.matchLexeme("*")) {
        parts.push("*");
        break;
      }
      const part = this.expectIdentifier("Expected an identifier after '.'.");
      if (!part) break;
      parts.push(part.lexeme);
    }
    const end = this.expectLexeme(";", "Expected ';' after import declaration.");
    return createNode("ImportDeclaration", start, end, { name: parts.join("."), isStatic, wildcard: parts.at(-1) === "*" });
  }

  parseTopLevelDeclaration() {
    const modifiers = this.parseModifiers();
    if (this.matchLexeme("@")) {
      this.unsupported(this.previous(), "Annotations are not supported by the Phase 2 parser.", "PARSE_UNSUPPORTED_ANNOTATION");
      this.skipAnnotationTail();
      return null;
    }
    if (this.matchKeyword("class")) return this.parseClassDeclaration(this.previous(), modifiers, "ClassDeclaration");
    if (this.matchKeyword("interface")) return this.parseClassDeclaration(this.previous(), modifiers, "InterfaceDeclaration");
    if (this.matchKeyword("enum") || this.matchKeyword("record")) {
      this.unsupported(this.previous(), "This type declaration is not supported by the current Java subset.", "PARSE_UNSUPPORTED_TYPE");
      return null;
    }
    this.errorAt(this.current(), "PARSE_EXPECTED_TYPE", "Expected a class or interface declaration.");
    return null;
  }

  parseClassDeclaration(start, modifiers, type) {
    const name = this.expectIdentifier("Expected a name after type declaration.");
    let superClass = null;
    const interfaces = [];
    if (this.matchKeyword("extends")) superClass = this.parseType(false);
    if (this.matchKeyword("implements")) {
      do {
        interfaces.push(this.parseType(false));
      } while (this.matchLexeme(","));
    }
    this.expectLexeme("{", `Expected '{' to start ${type === "ClassDeclaration" ? "class" : "interface"} body.`);
    const members = [];
    while (!this.checkLexeme("}") && !this.isAtEnd()) {
      const member = this.parseClassMember(name?.lexeme, type === "InterfaceDeclaration");
      if (member) members.push(member);
      else this.synchronizeMember();
    }
    const end = this.expectLexeme("}", "Expected '}' to close type declaration.");
    return createNode(type, start, end, {
      name: name?.lexeme || "<missing>",
      modifiers,
      superClass,
      interfaces,
      members,
    });
  }

  parseClassMember(className, inInterface) {
    if (this.matchLexeme(";")) return createNode("EmptyDeclaration", this.previous(), this.previous());
    if (this.checkLexeme("@")) {
      this.unsupported(this.current(), "Annotations are not supported by the Phase 2 parser.", "PARSE_UNSUPPORTED_ANNOTATION");
      this.advance();
      this.skipAnnotationTail();
      return null;
    }
    const start = this.current();
    const modifiers = this.parseModifiers();

    if (this.checkIdentifier() && this.current().lexeme === className && this.peek().lexeme === "(") {
      const name = this.advance();
      return this.parseConstructorDeclaration(start, name, modifiers);
    }

    const memberType = this.parseType(true);
    const name = this.expectIdentifier("Expected a field or method name.");
    if (!name) return null;
    if (this.matchLexeme("(")) return this.parseMethodDeclaration(start, memberType, name, modifiers, inInterface);
    return this.parseFieldDeclaration(start, memberType, name, modifiers);
  }

  parseConstructorDeclaration(start, name, modifiers) {
    this.expectLexeme("(", "Expected '(' after constructor name.");
    const parameters = this.parseParametersAfterOpenParen();
    const throwsTypes = this.parseThrowsClause();
    const body = this.parseRequiredBlock("Expected a constructor body.");
    return createNode("ConstructorDeclaration", start, body || this.previous(), {
      name: name.lexeme,
      modifiers,
      parameters,
      throwsTypes,
      body,
    });
  }

  parseMethodDeclaration(start, returnType, name, modifiers, inInterface) {
    const parameters = this.parseParametersAfterOpenParen();
    const throwsTypes = this.parseThrowsClause();
    let body = null;
    if (this.matchLexeme(";")) {
      body = null;
    } else if (this.checkLexeme("{")) {
      body = this.parseBlockStatement();
    } else {
      this.errorAt(this.current(), "PARSE_EXPECTED_METHOD_BODY", "Expected a method body or ';'.");
    }
    if (inInterface && !body && !modifiers.includes("abstract")) {
      // Interface method declarations without bodies are valid and represented explicitly.
    }
    return createNode("MethodDeclaration", start, body || this.previous(), {
      name: name.lexeme,
      modifiers,
      returnType,
      parameters,
      throwsTypes,
      body,
    });
  }

  parseFieldDeclaration(start, fieldType, firstName, modifiers) {
    const declarators = [this.parseVariableDeclarator(firstName)];
    while (this.matchLexeme(",")) {
      const name = this.expectIdentifier("Expected a field name after ','.");
      if (!name) break;
      declarators.push(this.parseVariableDeclarator(name));
    }
    const end = this.expectLexeme(";", "Expected ';' after field declaration.");
    return createNode("FieldDeclaration", start, end, { modifiers, fieldType, declarators });
  }

  parseParametersAfterOpenParen() {
    const parameters = [];
    if (!this.checkLexeme(")")) {
      do {
        const start = this.current();
        const modifiers = this.parseModifiers().filter((modifier) => modifier === "final");
        const parameterType = this.parseType(false);
        const name = this.expectIdentifier("Expected a parameter name.");
        let variadic = false;
        if (this.matchLexeme(".") && this.matchLexeme(".") && this.matchLexeme(".")) variadic = true;
        parameters.push(createNode("Parameter", start, name || this.previous(), {
          modifiers,
          parameterType,
          name: name?.lexeme || "<missing>",
          variadic,
        }));
      } while (this.matchLexeme(","));
    }
    this.expectLexeme(")", "Expected ')' after parameters.");
    return parameters;
  }

  parseThrowsClause() {
    const types = [];
    if (!this.matchKeyword("throws")) return types;
    do {
      types.push(this.parseType(false));
    } while (this.matchLexeme(","));
    return types;
  }

  parseType(allowVoid) {
    const start = this.current();
    let name = null;
    if (allowVoid && this.checkKeyword("void")) {
      name = this.advance().lexeme;
    } else if (this.checkKeyword() && PRIMITIVE_TYPES.has(this.current().lexeme)) {
      name = this.advance().lexeme;
    } else if (this.checkIdentifier()) {
      name = this.advance().lexeme;
      while (this.matchLexeme(".")) {
        const segment = this.expectIdentifier("Expected a type name after '.'.");
        if (!segment) break;
        name += `.${segment.lexeme}`;
      }
    } else {
      this.errorAt(this.current(), "PARSE_EXPECTED_TYPE", "Expected a Java type.");
      if (!this.isAtEnd()) this.advance();
      return createNode("TypeReference", start, this.previous(), { name: "<error>", arrayDimensions: 0 });
    }

    if (this.checkLexeme("<")) this.skipUnsupportedGenericType();
    let arrayDimensions = 0;
    while (this.checkLexeme("[") && this.peek().lexeme === "]") {
      this.advance();
      this.expectLexeme("]", "Expected ']' in array type.");
      arrayDimensions += 1;
    }
    return createNode("TypeReference", start, this.previous(), { name, arrayDimensions });
  }

  skipUnsupportedGenericType() {
    const start = this.current();
    this.unsupported(start, "Generic type arguments are not supported by the Phase 2 parser.", "PARSE_UNSUPPORTED_GENERIC");
    let depth = 0;
    while (!this.isAtEnd()) {
      if (this.matchLexeme("<")) depth += 1;
      else if (this.matchLexeme(">")) {
        depth -= 1;
        if (depth === 0) return;
      } else this.advance();
    }
  }

  parseRequiredBlock(message) {
    if (this.checkLexeme("{")) return this.parseBlockStatement();
    this.errorAt(this.current(), "PARSE_EXPECTED_BLOCK", message);
    return null;
  }

  parseBlockStatement() {
    const start = this.expectLexeme("{", "Expected '{' to start a block.");
    const statements = [];
    while (!this.checkLexeme("}") && !this.isAtEnd()) {
      const before = this.index;
      const statement = this.parseStatement();
      if (statement) statements.push(statement);
      if (this.index === before) this.advance();
    }
    const end = this.expectLexeme("}", "Expected '}' to close block.");
    return createNode("BlockStatement", start, end, { statements });
  }

  parseStatement() {
    const start = this.current();
    if (this.matchLexeme(";")) return createNode("EmptyStatement", start, this.previous());
    if (this.checkLexeme("{")) return this.parseBlockStatement();
    if (this.matchKeyword("if")) return this.parseIfStatement(start);
    if (this.matchKeyword("while")) return this.parseWhileStatement(start);
    if (this.matchKeyword("do")) return this.parseDoWhileStatement(start);
    if (this.matchKeyword("for")) return this.parseForStatement(start);
    if (this.matchKeyword("switch")) return this.parseSwitchStatement(start);
    if (this.matchKeyword("return")) return this.parseReturnStatement(start);
    if (this.matchKeyword("break")) return this.parseSimpleJumpStatement("BreakStatement", start);
    if (this.matchKeyword("continue")) return this.parseSimpleJumpStatement("ContinueStatement", start);
    if (this.matchKeyword("throw")) return this.parseThrowStatement(start);
    if (this.matchKeyword("try")) return this.parseTryStatement(start);
    if (this.matchKeyword("assert") || this.matchKeyword("synchronized")) {
      this.unsupported(this.previous(), `The '${this.previous().lexeme}' statement is not supported by the Phase 2 parser.`, "PARSE_UNSUPPORTED_STATEMENT");
      return null;
    }
    if (this.isLocalVariableDeclaration()) return this.parseVariableDeclarationStatement(start);
    const expression = this.parseExpression();
    const end = this.expectLexeme(";", "Expected ';' after expression statement.");
    return createNode("ExpressionStatement", start, end, { expression });
  }

  parseIfStatement(start) {
    this.expectLexeme("(", "Expected '(' after 'if'.");
    const test = this.parseExpression();
    this.expectLexeme(")", "Expected ')' after if condition.");
    const consequent = this.parseStatement();
    const alternate = this.matchKeyword("else") ? this.parseStatement() : null;
    return createNode("IfStatement", start, alternate || consequent || this.previous(), { test, consequent, alternate });
  }

  parseWhileStatement(start) {
    this.expectLexeme("(", "Expected '(' after 'while'.");
    const test = this.parseExpression();
    this.expectLexeme(")", "Expected ')' after while condition.");
    const body = this.parseStatement();
    return createNode("WhileStatement", start, body || this.previous(), { test, body });
  }

  parseDoWhileStatement(start) {
    const body = this.parseStatement();
    this.expectKeyword("while", "Expected 'while' after do-while body.");
    this.expectLexeme("(", "Expected '(' after 'while'.");
    const test = this.parseExpression();
    this.expectLexeme(")", "Expected ')' after do-while condition.");
    const end = this.expectLexeme(";", "Expected ';' after do-while statement.");
    return createNode("DoWhileStatement", start, end, { body, test });
  }

  parseForStatement(start) {
    this.expectLexeme("(", "Expected '(' after 'for'.");
    const checkpoint = this.index;
    const enhanced = this.tryParseEnhancedForHeader();
    if (enhanced) {
      const body = this.parseStatement();
      return createNode("EnhancedForStatement", start, body || this.previous(), { ...enhanced, body });
    }
    this.index = checkpoint;
    let initializer = null;
    if (!this.checkLexeme(";")) {
      initializer = this.isLocalVariableDeclaration() ? this.parseVariableDeclarationStatement(start, false) : this.parseExpressionList();
    }
    this.expectLexeme(";", "Expected ';' after for initializer.");
    const test = this.checkLexeme(";") ? null : this.parseExpression();
    this.expectLexeme(";", "Expected ';' after for condition.");
    const update = this.checkLexeme(")") ? [] : this.parseExpressionList();
    this.expectLexeme(")", "Expected ')' after for clauses.");
    const body = this.parseStatement();
    return createNode("ForStatement", start, body || this.previous(), { initializer, test, update, body });
  }

  tryParseEnhancedForHeader() {
    const headerStart = this.current();
    const modifiers = this.parseModifiers().filter((modifier) => modifier === "final");
    if (!this.isTypeStart(false)) return null;
    const variableType = this.parseType(false);
    const variable = this.expectIdentifier("Expected enhanced-for variable name.");
    if (!this.matchLexeme(":")) return null;
    const iterable = this.parseExpression();
    this.expectLexeme(")", "Expected ')' after enhanced-for header.");
    return { variable: createNode("Parameter", headerStart, variable || this.previous(), { modifiers, parameterType: variableType, name: variable?.lexeme || "<missing>", variadic: false }), iterable };
  }

  parseSwitchStatement(start) {
    this.expectLexeme("(", "Expected '(' after 'switch'.");
    const discriminant = this.parseExpression();
    this.expectLexeme(")", "Expected ')' after switch expression.");
    this.expectLexeme("{", "Expected '{' to start switch body.");
    const cases = [];
    while (!this.checkLexeme("}") && !this.isAtEnd()) {
      const caseStart = this.current();
      let test = null;
      if (this.matchKeyword("case")) {
        test = this.parseExpression();
        this.expectLexeme(":", "Expected ':' after case label.");
      } else if (this.matchKeyword("default")) {
        this.expectLexeme(":", "Expected ':' after default label.");
      } else {
        this.errorAt(this.current(), "PARSE_EXPECTED_CASE", "Expected 'case' or 'default' in switch body.");
        this.advance();
        continue;
      }
      const statements = [];
      while (!this.checkKeyword("case") && !this.checkKeyword("default") && !this.checkLexeme("}") && !this.isAtEnd()) {
        const statement = this.parseStatement();
        if (statement) statements.push(statement);
      }
      cases.push(createNode("SwitchCase", caseStart, statements.at(-1) || this.previous(), { test, statements }));
    }
    const end = this.expectLexeme("}", "Expected '}' after switch body.");
    return createNode("SwitchStatement", start, end, { discriminant, cases });
  }

  parseReturnStatement(start) {
    const argument = this.checkLexeme(";") ? null : this.parseExpression();
    const end = this.expectLexeme(";", "Expected ';' after return statement.");
    return createNode("ReturnStatement", start, end, { argument });
  }

  parseSimpleJumpStatement(type, start) {
    const label = this.checkIdentifier() ? this.advance().lexeme : null;
    const end = this.expectLexeme(";", `Expected ';' after ${type === "BreakStatement" ? "break" : "continue"}.`);
    return createNode(type, start, end, { label });
  }

  parseThrowStatement(start) {
    const argument = this.parseExpression();
    const end = this.expectLexeme(";", "Expected ';' after throw statement.");
    return createNode("ThrowStatement", start, end, { argument });
  }

  parseTryStatement(start) {
    const block = this.parseRequiredBlock("Expected a block after 'try'.");
    const handlers = [];
    while (this.matchKeyword("catch")) {
      const catchStart = this.previous();
      this.expectLexeme("(", "Expected '(' after 'catch'.");
      const parameterType = this.parseType(false);
      const parameter = this.expectIdentifier("Expected catch variable name.");
      this.expectLexeme(")", "Expected ')' after catch parameter.");
      const body = this.parseRequiredBlock("Expected a catch block.");
      handlers.push(createNode("CatchClause", catchStart, body || this.previous(), { parameter: createNode("Parameter", parameterType.loc?.start || catchStart, parameter || this.previous(), { modifiers: [], parameterType, name: parameter?.lexeme || "<missing>", variadic: false }), body }));
    }
    const finalizer = this.matchKeyword("finally") ? this.parseRequiredBlock("Expected a finally block.") : null;
    if (!handlers.length && !finalizer) this.errorAt(this.current(), "PARSE_EXPECTED_CATCH", "Expected 'catch' or 'finally' after try block.");
    return createNode("TryStatement", start, finalizer || handlers.at(-1) || block || this.previous(), { block, handlers, finalizer });
  }

  parseVariableDeclarationStatement(start, requireSemicolon = true) {
    const modifiers = this.parseModifiers().filter((modifier) => modifier === "final");
    const variableType = this.parseType(false);
    const declarators = [];
    do {
      const name = this.expectIdentifier("Expected a variable name.");
      if (!name) break;
      declarators.push(this.parseVariableDeclarator(name));
    } while (this.matchLexeme(","));
    const end = requireSemicolon ? this.expectLexeme(";", "Expected ';' after variable declaration.") : this.previous();
    return createNode("VariableDeclarationStatement", start, end, { modifiers, variableType, declarators });
  }

  parseVariableDeclarator(name) {
    const start = name;
    let arrayDimensions = 0;
    while (this.matchLexeme("[")) {
      this.expectLexeme("]", "Expected ']' after variable name.");
      arrayDimensions += 1;
    }
    const initializer = this.matchLexeme("=") ? (this.checkLexeme("{") ? this.parseArrayInitializer() : this.parseExpression()) : null;
    return createNode("VariableDeclarator", start, initializer || this.previous(), { name: name.lexeme, arrayDimensions, initializer });
  }

  parseExpressionList() {
    const expressions = [this.parseExpression()];
    while (this.matchLexeme(",")) expressions.push(this.parseExpression());
    return expressions;
  }

  parseExpression() { return this.parseAssignment(); }

  parseAssignment() {
    const left = this.parseConditional();
    if (this.checkOperator() && ASSIGNMENT_OPERATORS.has(this.current().lexeme)) {
      const operator = this.advance();
      const right = this.parseAssignment();
      return createNode("AssignmentExpression", left.loc.start, right, { operator: operator.lexeme, left, right });
    }
    return left;
  }

  parseConditional() {
    const test = this.parseBinaryExpression(0);
    if (!this.matchLexeme("?")) return test;
    const consequent = this.parseExpression();
    this.expectLexeme(":", "Expected ':' in conditional expression.");
    const alternate = this.parseConditional();
    return createNode("ConditionalExpression", test.loc.start, alternate, { test, consequent, alternate });
  }

  parseBinaryExpression(minimumPrecedence) {
    let left = this.parseUnary();
    while (true) {
      const operator = this.current();
      const precedence = binaryPrecedence(operator);
      if (precedence < minimumPrecedence) break;
      this.advance();
      const right = this.parseBinaryExpression(precedence + 1);
      left = createNode(operator.lexeme === "instanceof" ? "InstanceOfExpression" : "BinaryExpression", left.loc.start, right, { operator: operator.lexeme, left, right });
    }
    return left;
  }

  parseUnary() {
    if (this.checkOperator() && ["!", "-", "+", "~", "++", "--"].includes(this.current().lexeme)) {
      const operator = this.advance();
      const argument = this.parseUnary();
      return createNode("UnaryExpression", operator, argument, { operator: operator.lexeme, argument, prefix: true });
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expression = this.parsePrimary();
    while (!this.isAtEnd()) {
      if (this.matchLexeme(".")) {
        const property = this.expectIdentifier("Expected a property name after '.'.");
        expression = createNode("MemberExpression", expression.loc.start, property || this.previous(), { object: expression, property: property?.lexeme || "<missing>", computed: false });
      } else if (this.matchLexeme("[")) {
        const property = this.parseExpression();
        const end = this.expectLexeme("]", "Expected ']' after array index.");
        expression = createNode("MemberExpression", expression.loc.start, end, { object: expression, property, computed: true });
      } else if (this.matchLexeme("(")) {
        const argumentsList = this.parseArgumentsAfterOpenParen();
        expression = createNode("CallExpression", expression.loc.start, this.previous(), { callee: expression, arguments: argumentsList });
      } else if (this.checkOperator() && ["++", "--"].includes(this.current().lexeme)) {
        const operator = this.advance();
        expression = createNode("UpdateExpression", expression.loc.start, operator, { operator: operator.lexeme, argument: expression, prefix: false });
      } else {
        break;
      }
    }
    return expression;
  }

  parsePrimary() {
    const token = this.current();
    if (["INTEGER_LITERAL", "FLOAT_LITERAL", "STRING_LITERAL", "CHAR_LITERAL", "BOOLEAN_LITERAL", "NULL_LITERAL"].includes(token.type)) {
      this.advance();
      return createNode("Literal", token, token, { value: token.value, raw: token.lexeme, literalType: token.type });
    }
    if (this.matchKeyword("this")) return createNode("ThisExpression", this.previous(), this.previous());
    if (this.matchKeyword("super")) return createNode("SuperExpression", this.previous(), this.previous());
    if (this.matchKeyword("new")) return this.parseNewExpression(this.previous());
    if (this.checkIdentifier()) {
      this.advance();
      return createNode("Identifier", token, token, { name: token.lexeme });
    }
    if (this.matchLexeme("(")) {
      const expression = this.parseExpression();
      const end = this.expectLexeme(")", "Expected ')' after grouped expression.");
      return createNode("ParenthesizedExpression", token, end, { expression });
    }
    if (this.checkLexeme("{")) return this.parseArrayInitializer();
    this.errorAt(token, "PARSE_EXPECTED_EXPRESSION", `Expected an expression but found '${token.lexeme || "end of file"}'.`);
    if (!this.isAtEnd()) this.advance();
    return createNode("ErrorExpression", token, this.previous(), {});
  }

  parseNewExpression(start) {
    const constructorType = this.parseType(false);
    const elementType = { ...constructorType, arrayDimensions: 0 };
    if (this.matchLexeme("(")) {
      const argumentsList = this.parseArgumentsAfterOpenParen();
      return createNode("NewExpression", start, this.previous(), { constructorType, arguments: argumentsList, dimensions: [], initializer: null });
    }
    const dimensions = Array.from({ length: constructorType.arrayDimensions }, () => null);
    while (this.matchLexeme("[")) {
      const dimension = this.checkLexeme("]") ? null : this.parseExpression();
      this.expectLexeme("]", "Expected ']' after array dimension.");
      dimensions.push(dimension);
    }
    const initializer = this.checkLexeme("{") ? this.parseArrayInitializer() : null;
    if (!dimensions.length) this.errorAt(this.current(), "PARSE_EXPECTED_NEW_TARGET", "Expected constructor arguments or array dimensions after 'new'.");
    return createNode("NewArrayExpression", start, initializer || this.previous(), { elementType, dimensions, initializer });
  }

  parseArgumentsAfterOpenParen() {
    const argumentsList = [];
    if (!this.checkLexeme(")")) {
      do {
        argumentsList.push(this.parseExpression());
      } while (this.matchLexeme(","));
    }
    this.expectLexeme(")", "Expected ')' after arguments.");
    return argumentsList;
  }

  parseArrayInitializer() {
    const start = this.expectLexeme("{", "Expected '{' to start array initializer.");
    const elements = [];
    while (!this.checkLexeme("}") && !this.isAtEnd()) {
      elements.push(this.checkLexeme("{") ? this.parseArrayInitializer() : this.parseExpression());
      if (!this.matchLexeme(",")) break;
    }
    const end = this.expectLexeme("}", "Expected '}' after array initializer.");
    return createNode("ArrayInitializer", start, end, { elements });
  }

  parseModifiers() {
    const modifiers = [];
    while (this.checkKeyword() && MODIFIERS.has(this.current().lexeme)) modifiers.push(this.advance().lexeme);
    return modifiers;
  }

  parseQualifiedName(context) {
    const names = [];
    const first = this.expectIdentifier(`Expected ${context}.`);
    if (first) names.push(first.lexeme);
    while (this.matchLexeme(".")) {
      const next = this.expectIdentifier(`Expected an identifier in ${context}.`);
      if (!next) break;
      names.push(next.lexeme);
    }
    return names.join(".");
  }

  isLocalVariableDeclaration() {
    let cursor = this.index;
    if (this.tokens[cursor]?.lexeme === "final") cursor += 1;
    const first = this.tokens[cursor];
    if (!first) return false;
    if (first.type === "KEYWORD" && PRIMITIVE_TYPES.has(first.lexeme)) {
      cursor += 1;
    } else if (first.type === "IDENTIFIER") {
      cursor += 1;
      while (this.tokens[cursor]?.lexeme === "." && this.tokens[cursor + 1]?.type === "IDENTIFIER") cursor += 2;
    } else {
      return false;
    }
    while (this.tokens[cursor]?.lexeme === "[" && this.tokens[cursor + 1]?.lexeme === "]") cursor += 2;
    return this.tokens[cursor]?.type === "IDENTIFIER";
  }

  isTypeStart(allowVoid) { return this.isTypeStartAt(this.index, allowVoid); }
  isTypeStartAt(index, allowVoid) {
    const token = this.tokens[index] || this.tokens.at(-1);
    return token.type === "IDENTIFIER" || (token.type === "KEYWORD" && (PRIMITIVE_TYPES.has(token.lexeme) || (allowVoid && token.lexeme === "void")));
  }

  synchronizeTopLevel() {
    if (this.isAtEnd()) return;
    this.advance();
    while (!this.isAtEnd()) {
      if (this.checkKeyword("class") || this.checkKeyword("interface") || this.checkKeyword("enum") || this.checkKeyword("record")) return;
      this.advance();
    }
  }

  synchronizeMember() {
    while (!this.isAtEnd() && !this.checkLexeme("}") && !this.checkLexeme(";")) this.advance();
    if (this.checkLexeme(";")) this.advance();
  }

  skipAnnotationTail() {
    if (this.checkIdentifier()) this.advance();
    if (!this.matchLexeme("(")) return;
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.matchLexeme("(")) depth += 1;
      else if (this.matchLexeme(")")) depth -= 1;
      else this.advance();
    }
  }

  unsupported(token, message, code) {
    this.diagnostics.push(createDiagnostic({ phase: "parser", code, message, severity: "warning", start: token.start, end: token.end }));
  }

  errorAt(token, code, message) {
    this.diagnostics.push(createDiagnostic({ phase: "parser", code, message, start: token.start, end: token.end }));
  }

  expectIdentifier(message) {
    if (this.checkIdentifier()) return this.advance();
    this.errorAt(this.current(), "PARSE_EXPECTED_IDENTIFIER", message);
    return null;
  }

  expectKeyword(keyword, message) {
    if (this.checkKeyword(keyword)) return this.advance();
    this.errorAt(this.current(), "PARSE_EXPECTED_KEYWORD", message);
    return null;
  }

  expectLexeme(lexeme, message) {
    if (this.checkLexeme(lexeme)) return this.advance();
    this.errorAt(this.current(), "PARSE_EXPECTED_TOKEN", message);
    return this.current();
  }

  matchKeyword(keyword) { if (!this.checkKeyword(keyword)) return false; this.advance(); return true; }
  matchLexeme(lexeme) { if (!this.checkLexeme(lexeme)) return false; this.advance(); return true; }
  checkKeyword(keyword) { return this.current().type === "KEYWORD" && (!keyword || this.current().lexeme === keyword); }
  checkIdentifier() { return this.current().type === "IDENTIFIER"; }
  checkOperator() { return this.current().type === "OPERATOR" || (this.current().type === "KEYWORD" && this.current().lexeme === "instanceof"); }
  checkLexeme(lexeme) { return this.current().lexeme === lexeme; }
  current() { return this.tokens[this.index] || this.tokens.at(-1); }
  previous() { return this.tokens[Math.max(0, this.index - 1)] || null; }
  peek(offset = 1) { return this.tokens[this.index + offset] || this.tokens.at(-1); }
  isAtEnd() { return this.current().type === "EOF"; }
  advance() { if (!this.isAtEnd()) this.index += 1; return this.previous(); }
}

function binaryPrecedence(token) {
  const operator = token.lexeme;
  if (operator === "||") return 1;
  if (operator === "&&") return 2;
  if (operator === "|") return 3;
  if (operator === "^") return 4;
  if (operator === "&") return 5;
  if (["==", "!="].includes(operator)) return 6;
  if (["<", ">", "<=", ">=", "instanceof"].includes(operator)) return 7;
  if (["<<", ">>", ">>>"].includes(operator)) return 8;
  if (["+", "-"].includes(operator)) return 9;
  if (["*", "/", "%"].includes(operator)) return 10;
  return -1;
}

