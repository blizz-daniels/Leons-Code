import { defaultValueFor, typeFromReference } from "../runtime/java-types.js";
const SCANNER_METHODS = new Set(["next", "nextLine", "nextInt", "nextLong", "nextDouble", "nextFloat", "nextBoolean", "hasNext", "close"]);

export function translate(ast) {
  return new JavaScriptTranslator(ast).translate();
}

export class JavaScriptTranslator {
  constructor(ast) {
    this.ast = ast;
    this.indentLevel = 0;
  }

  translate() {
    const classes = this.ast.declarations.filter((node) => node.type === "ClassDeclaration");
    const chunks = ["(async () => {", "    \"use strict\";", ""];
    this.indentLevel = 1;
    for (const classNode of classes) {
      chunks.push(this.classDeclaration(classNode), "");
    }
    const entryPoint = this.findEntryPoint(classes);
    if (entryPoint) chunks.push(`${this.indent()}await ${entryPoint.className}.${entryPoint.methodName}(JavaRuntime.args);`);
    this.indentLevel = 0;
    chunks.push("})()");
    return {
      code: chunks.join("\n").trimEnd() + "\n",
      metadata: { entryPoint, classes: classes.map((classNode) => classNode.name) },
    };
  }

  findEntryPoint(classes) {
    for (const classNode of classes) {
      const method = classNode.members.find((member) => member.type === "MethodDeclaration" && member.name === "main" && member.modifiers.includes("static") && typeFromReference(member.returnType) === "void" && member.parameters.length === 1);
      if (method) return { className: classNode.name, methodName: method.name };
    }
    return null;
  }

  classDeclaration(node) {
    const parent = node.superClass ? ` extends ${typeFromReference(node.superClass)}` : "";
    const lines = [`${this.indent()}class ${node.name}${parent} {`];
    this.indentLevel += 1;
    const fields = node.members.filter((member) => member.type === "FieldDeclaration");
    const methods = node.members.filter((member) => member.type === "MethodDeclaration" || member.type === "ConstructorDeclaration");
    for (const field of fields) lines.push(...this.fieldDeclaration(field));
    if (fields.length && methods.length) lines.push("");
    for (let index = 0; index < methods.length; index += 1) {
      lines.push(...this.methodDeclaration(methods[index]));
      if (index < methods.length - 1) lines.push("");
    }
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines.join("\n");
  }

  fieldDeclaration(node) {
    const type = typeFromReference(node.fieldType);
    const prefix = node.modifiers.includes("static") ? "static " : "";
    return node.declarators.map((declarator) => {
      const fieldType = `${type}${"[]".repeat(declarator.arrayDimensions)}`;
      const initializer = declarator.initializer ? this.expression(declarator.initializer) : `JavaRuntime.defaultValue(${quote(fieldType)})`;
      return `${this.indent()}${prefix}${declarator.name} = ${initializer};`;
    });
  }

  methodDeclaration(node) {
    const name = node.type === "ConstructorDeclaration" ? "constructor" : node.name;
    const prefix = node.type === "MethodDeclaration" && node.modifiers.includes("static") ? "static " : "";
    const asyncKeyword = node.type === "MethodDeclaration" ? "async " : "";
    const parameters = node.parameters.map((parameter) => `${parameter.variadic ? "..." : ""}${parameter.name}`).join(", ");
    const lines = [`${this.indent()}${prefix}${asyncKeyword}${name}(${parameters}) {`];
    this.indentLevel += 1;
    const previousAsyncContext = this.isAsyncContext;
    this.isAsyncContext = node.type === "MethodDeclaration";
    if (node.body) lines.push(...this.blockContents(node.body));
    else lines.push(`${this.indent()}JavaRuntime.unsupported(${quote(`Method '${node.name}' has no executable body.`)});`);
    this.isAsyncContext = previousAsyncContext;
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  blockContents(block) {
    if (!block.statements.length) return [`${this.indent()}// Empty Java block.`];
    return block.statements.flatMap((statement) => this.statement(statement));
  }

  statement(node) {
    switch (node.type) {
      case "EmptyStatement": return [`${this.indent()};`];
      case "BlockStatement": return this.blockStatement(node);
      case "VariableDeclarationStatement": return this.variableDeclaration(node, true);
      case "ExpressionStatement": return [`${this.indent()}${this.expression(node.expression)};`];
      case "IfStatement": return this.ifStatement(node);
      case "WhileStatement": return this.loopStatement(`while (${this.expression(node.test)})`, node.body);
      case "DoWhileStatement": return this.doWhileStatement(node);
      case "ForStatement": return this.forStatement(node);
      case "EnhancedForStatement": return this.loopStatement(`for (const ${node.variable.name} of ${this.expression(node.iterable)})`, node.body);
      case "SwitchStatement": return this.switchStatement(node);
      case "BreakStatement": return [`${this.indent()}break${node.label ? ` ${node.label}` : ""};`];
      case "ContinueStatement": return [`${this.indent()}continue${node.label ? ` ${node.label}` : ""};`];
      case "ReturnStatement": return [`${this.indent()}return${node.argument ? ` ${this.expression(node.argument)}` : ""};`];
      case "ThrowStatement": return [`${this.indent()}throw ${this.expression(node.argument)};`];
      case "TryStatement": return this.tryStatement(node);
      default: return [`${this.indent()}JavaRuntime.unsupported(${quote(`Unsupported statement '${node.type}'.`)});`];
    }
  }

  blockStatement(node) {
    const lines = [`${this.indent()}{`];
    this.indentLevel += 1;
    lines.push(...this.blockContents(node));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  variableDeclaration(node, includeSemicolon) {
    const type = typeFromReference(node.variableType);
    const declarations = node.declarators.map((declarator) => {
      const declaredType = `${type}${"[]".repeat(declarator.arrayDimensions)}`;
      return `${declarator.name} = ${declarator.initializer ? this.expression(declarator.initializer) : `JavaRuntime.defaultValue(${quote(declaredType)})`}`;
    });
    return [`${this.indent()}let ${declarations.join(", ")}${includeSemicolon ? ";" : ""}`];
  }

  ifStatement(node) {
    const lines = [`${this.indent()}if (${this.expression(node.test)}) {`];
    this.indentLevel += 1;
    lines.push(...this.statementContents(node.consequent));
    this.indentLevel -= 1;
    if (!node.alternate) {
      lines.push(`${this.indent()}}`);
      return lines;
    }
    if (node.alternate.type === "IfStatement") {
      const alternate = this.ifStatement(node.alternate);
      lines.push(`${this.indent()}} else ${alternate[0].trimStart()}`, ...alternate.slice(1));
      return lines;
    }
    lines.push(`${this.indent()}} else {`);
    this.indentLevel += 1;
    lines.push(...this.statementContents(node.alternate));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  loopStatement(header, body) {
    const lines = [`${this.indent()}${header} {`, `${this.indent(1)}JavaRuntime.checkExecution();`];
    this.indentLevel += 1;
    lines.push(...this.statementContents(body));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  doWhileStatement(node) {
    const lines = [`${this.indent()}do {`, `${this.indent(1)}JavaRuntime.checkExecution();`];
    this.indentLevel += 1;
    lines.push(...this.statementContents(node.body));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}} while (${this.expression(node.test)});`);
    return lines;
  }

  forStatement(node) {
    let initializer = "";
    if (node.initializer?.type === "VariableDeclarationStatement") initializer = this.variableDeclaration(node.initializer, false)[0].trim().replace(/^let\s/, "let ");
    else if (node.initializer) initializer = node.initializer.map((expression) => this.expression(expression)).join(", ");
    const test = node.test ? this.expression(node.test) : "true";
    const update = node.update.map((expression) => this.expression(expression)).join(", ");
    const lines = [`${this.indent()}for (${initializer}; ${test}; ${update}) {`, `${this.indent(1)}JavaRuntime.checkExecution();`];
    this.indentLevel += 1;
    lines.push(...this.statementContents(node.body));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  switchStatement(node) {
    const lines = [`${this.indent()}switch (${this.expression(node.discriminant)}) {`];
    this.indentLevel += 1;
    for (const caseNode of node.cases) {
      lines.push(`${this.indent()}${caseNode.test ? `case ${this.expression(caseNode.test)}` : "default"}:`);
      this.indentLevel += 1;
      caseNode.statements.forEach((statement) => lines.push(...this.statement(statement)));
      this.indentLevel -= 1;
    }
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    return lines;
  }

  tryStatement(node) {
    const lines = [`${this.indent()}try {`];
    this.indentLevel += 1;
    lines.push(...this.blockContents(node.block));
    this.indentLevel -= 1;
    lines.push(`${this.indent()}}`);
    for (const handler of node.handlers) {
      lines.push(`${this.indent()}catch (${handler.parameter.name}) {`);
      this.indentLevel += 1;
      lines.push(...this.blockContents(handler.body));
      this.indentLevel -= 1;
      lines.push(`${this.indent()}}`);
    }
    if (node.finalizer) {
      lines.push(`${this.indent()}finally {`);
      this.indentLevel += 1;
      lines.push(...this.blockContents(node.finalizer));
      this.indentLevel -= 1;
      lines.push(`${this.indent()}}`);
    }
    return lines;
  }

  statementContents(node) {
    return node?.type === "BlockStatement" ? this.blockContents(node) : this.statement(node);
  }

  expression(node) {
    switch (node.type) {
      case "Literal": return literal(node);
      case "Identifier": return node.resolvedKind === "field" ? `this.${node.name}` : node.name;
      case "ThisExpression": return "this";
      case "SuperExpression": return "super";
      case "ParenthesizedExpression": return `(${this.expression(node.expression)})`;
      case "UnaryExpression": return node.prefix ? `(${node.operator}${this.expression(node.argument)})` : `(${this.expression(node.argument)}${node.operator})`;
      case "UpdateExpression": return node.prefix ? `(${node.operator}${this.expression(node.argument)})` : `(${this.expression(node.argument)}${node.operator})`;
      case "BinaryExpression": return this.binaryExpression(node);
      case "InstanceOfExpression": return `(${this.expression(node.left)} instanceof ${this.expression(node.right)})`;
      case "ConditionalExpression": return `(${this.expression(node.test)} ? ${this.expression(node.consequent)} : ${this.expression(node.alternate)})`;
      case "AssignmentExpression": return `(${this.expression(node.left)} ${node.operator} ${this.expression(node.right)})`;
      case "MemberExpression": return node.computed ? `${this.expression(node.object)}[${this.expression(node.property)}]` : `${this.expression(node.object)}.${node.property}`;
      case "CallExpression": return this.callExpression(node);
      case "NewExpression": return this.newExpression(node);
      case "NewArrayExpression": return this.newArrayExpression(node);
      case "ArrayInitializer": return `[${node.elements.map((element) => this.expression(element)).join(", ")}]`;
      default: return `JavaRuntime.unsupported(${quote(`Unsupported expression '${node.type}'.`)})`;
    }
  }

  binaryExpression(node) {
    const left = this.expression(node.left);
    const right = this.expression(node.right);
    if (["+", "-", "*", "/", "%"].includes(node.operator)) return `JavaRuntime.binary(${quote(node.operator)}, ${left}, ${right}, ${quote(node.semanticType || "int")})`;
    return `(${left} ${node.operator} ${right})`;
  }

  callExpression(node) {
    const path = pathOf(node.callee);
    const args = node.arguments.map((argument) => this.expression(argument));
    const output = { "System.out.print": "print", "System.out.println": "println", "System.err.print": "error", "System.err.println": "errorln" }[path];
    if (output) return `JavaRuntime.${output}(${args.join(", ")})`;
    if (path.startsWith("Math.")) return `JavaRuntime.math.${path.slice(5)}(${args.join(", ")})`;
    if (node.callee.type === "MemberExpression" && node.callee.property === "equals") return `JavaRuntime.stringEquals(${this.expression(node.callee.object)}, ${args[0] || "null"})`;
    if (node.callee.type === "MemberExpression" && node.callee.property === "length") return `JavaRuntime.stringLength(${this.expression(node.callee.object)})`;
    const stringMethod = { contains: "stringContains", charAt: "stringCharAt", substring: "stringSubstring", toUpperCase: "stringUpper", toLowerCase: "stringLower" }[node.callee.property];
    if (node.callee.type === "MemberExpression" && stringMethod) return `JavaRuntime.${stringMethod}(${[this.expression(node.callee.object), ...args].join(", ")})`;
    if (node.callee.type === "MemberExpression" && SCANNER_METHODS.has(node.callee.property)) {
      if (!this.isAsyncContext) return `JavaRuntime.unsupported(${quote("Scanner input is only supported inside methods.")})`;
      return `await JavaRuntime.scannerCall(${this.expression(node.callee.object)}, ${quote(node.callee.property)})`;
    }
    if (node.callee.type === "SuperExpression") return `super(${args.join(", ")})`;
    const call = node.callee.type === "Identifier" ? `this.${node.callee.name}(${args.join(", ")})` : `${this.expression(node.callee)}(${args.join(", ")})`;
    return this.isAsyncContext ? `await ${call}` : call;
  }

  newExpression(node) {
    const type = typeFromReference(node.constructorType);
    if (type === "Scanner") return "JavaRuntime.createScanner()";
    if (["Exception", "RuntimeException", "IllegalArgumentException", "ArithmeticException", "InputMismatchException"].includes(type)) return `new Error(${node.arguments.map((argument) => this.expression(argument)).join(", ")})`;
    return `new ${type}(${node.arguments.map((argument) => this.expression(argument)).join(", ")})`;
  }

  newArrayExpression(node) {
    if (node.initializer) return `JavaRuntime.arrayFromInitializer(${this.expression(node.initializer)})`;
    return `JavaRuntime.createArray([${node.dimensions.map((dimension) => dimension ? this.expression(dimension) : "0").join(", ")}], ${quote(typeFromReference(node.elementType))})`;
  }

  indent(offset = 0) { return "    ".repeat(this.indentLevel + offset); }
}

function pathOf(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression" || node.computed) return "";
  const prefix = pathOf(node.object);
  return prefix ? `${prefix}.${node.property}` : "";
}

function literal(node) {
  if (node.literalType === "NULL_LITERAL") return "null";
  if (node.literalType === "BOOLEAN_LITERAL") return node.value ? "true" : "false";
  if (node.literalType === "STRING_LITERAL" || node.literalType === "CHAR_LITERAL") return quote(node.value);
  return node.raw.replace(/[fFdDlL]$/, "");
}

function quote(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

