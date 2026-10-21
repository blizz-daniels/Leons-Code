import { createDiagnostic } from "./diagnostics.js";
import {
  JAVA_TYPES,
  arrayType,
  elementTypeOf,
  isArrayType,
  isAssignable,
  isNumericType,
  numericPromotion,
  typeFromReference,
} from "../runtime/java-types.js";

const BUILTIN_CLASSES = new Set(["Object", "String", "Math", "System", "Scanner", "Exception", "RuntimeException", "IllegalArgumentException", "ArithmeticException", "InputMismatchException"]);
const SCANNER_RETURN_TYPES = Object.freeze({ next: JAVA_TYPES.STRING, nextLine: JAVA_TYPES.STRING, nextInt: JAVA_TYPES.INT, nextLong: JAVA_TYPES.LONG, nextDouble: JAVA_TYPES.DOUBLE, nextFloat: JAVA_TYPES.FLOAT, nextBoolean: JAVA_TYPES.BOOLEAN, hasNext: JAVA_TYPES.BOOLEAN, close: JAVA_TYPES.VOID });

export function analyze(ast) {
  return new SemanticAnalyzer(ast).analyze();
}

export class SemanticAnalyzer {
  constructor(ast) {
    this.ast = ast;
    this.diagnostics = [];
    this.classes = new Map();
    this.currentClass = null;
    this.currentMethod = null;
    this.scopes = [];
  }

  analyze() {
    this.collectClasses();
    for (const declaration of this.ast.declarations) {
      if (declaration.type === "ClassDeclaration" || declaration.type === "InterfaceDeclaration") this.analyzeClass(declaration);
    }
    return { diagnostics: this.diagnostics, symbols: { classes: [...this.classes.keys()] } };
  }

  collectClasses() {
    for (const declaration of this.ast.declarations) {
      if (declaration.type !== "ClassDeclaration" && declaration.type !== "InterfaceDeclaration") continue;
      if (this.classes.has(declaration.name)) {
        this.error(declaration, "SEM_DUPLICATE_CLASS", `Class '${declaration.name}' is declared more than once.`);
      } else {
        this.classes.set(declaration.name, { node: declaration, fields: new Map(), methods: new Map() });
      }
    }
  }

  analyzeClass(node) {
    this.currentClass = this.classes.get(node.name);
    if (node.superClass && !this.isKnownClass(typeFromReference(node.superClass))) {
      this.error(node.superClass, "SEM_UNKNOWN_CLASS", `Unknown parent class '${typeFromReference(node.superClass)}'.`);
    }
    for (const member of node.members) this.collectMember(member);
    for (const member of node.members) {
      if (member.type === "FieldDeclaration") this.analyzeField(member);
      if (member.type === "MethodDeclaration" || member.type === "ConstructorDeclaration") this.analyzeMethod(member);
    }
    this.currentClass = null;
  }

  collectMember(member) {
    if (member.type === "FieldDeclaration") {
      const type = typeFromReference(member.fieldType);
      this.checkKnownType(type, member.fieldType);
      for (const declarator of member.declarators) {
        if (this.currentClass.fields.has(declarator.name)) {
          this.error(declarator, "SEM_DUPLICATE_FIELD", `Field '${declarator.name}' is already declared in '${this.currentClass.node.name}'.`);
        } else {
          this.currentClass.fields.set(declarator.name, { type: arrayType(type, declarator.arrayDimensions), node: member, static: member.modifiers.includes("static") });
        }
      }
    }
    if (member.type === "MethodDeclaration" || member.type === "ConstructorDeclaration") {
      const name = member.type === "ConstructorDeclaration" ? "<constructor>" : member.name;
      const signature = { node: member, returnType: member.type === "ConstructorDeclaration" ? JAVA_TYPES.VOID : typeFromReference(member.returnType), parameters: member.parameters.map((parameter) => typeFromReference(parameter.parameterType)), static: member.modifiers.includes("static") };
      const prior = this.currentClass.methods.get(name);
      if (prior) {
        this.error(member, "SEM_UNSUPPORTED_OVERLOAD", `Method overloading for '${name}' is not available in the current runtime.`);
      } else {
        this.currentClass.methods.set(name, signature);
      }
      this.checkKnownType(signature.returnType, member.returnType);
      for (const parameter of member.parameters) this.checkKnownType(typeFromReference(parameter.parameterType), parameter.parameterType);
    }
  }

  analyzeField(member) {
    const type = typeFromReference(member.fieldType);
    this.pushScope();
    for (const declarator of member.declarators) {
      const targetType = arrayType(type, declarator.arrayDimensions);
      if (declarator.initializer?.type === "ArrayInitializer") this.checkArrayInitializer(targetType, declarator.initializer);
      else if (declarator.initializer) this.ensureAssignable(targetType, this.expressionType(declarator.initializer), declarator.initializer, `Cannot assign value to field '${declarator.name}'.`);
    }
    this.popScope();
  }

  analyzeMethod(method) {
    this.currentMethod = method;
    this.pushScope();
    for (const parameter of method.parameters) {
      const type = typeFromReference(parameter.parameterType);
      this.declare(parameter.name, type, parameter);
    }
    if (method.body) this.analyzeStatement(method.body);
    this.popScope();
    this.currentMethod = null;
  }

  analyzeStatement(statement) {
    if (!statement) return;
    switch (statement.type) {
      case "BlockStatement":
        this.pushScope();
        statement.statements.forEach((child) => this.analyzeStatement(child));
        this.popScope();
        break;
      case "VariableDeclarationStatement":
        this.analyzeVariableDeclaration(statement);
        break;
      case "ExpressionStatement":
        this.expressionType(statement.expression);
        break;
      case "IfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        this.ensureBoolean(this.expressionType(statement.test), statement.test);
        this.analyzeStatement(statement.body || statement.consequent);
        if (statement.alternate) this.analyzeStatement(statement.alternate);
        break;
      case "ForStatement":
        this.pushScope();
        if (statement.initializer?.type === "VariableDeclarationStatement") this.analyzeVariableDeclaration(statement.initializer);
        else statement.initializer?.forEach((expression) => this.expressionType(expression));
        if (statement.test) this.ensureBoolean(this.expressionType(statement.test), statement.test);
        statement.update.forEach((expression) => this.expressionType(expression));
        this.analyzeStatement(statement.body);
        this.popScope();
        break;
      case "EnhancedForStatement": {
        const iterableType = this.expressionType(statement.iterable);
        if (!isArrayType(iterableType)) this.error(statement.iterable, "SEM_EXPECTED_ARRAY", "Enhanced for loops currently require an array.");
        this.pushScope();
        this.declare(statement.variable.name, typeFromReference(statement.variable.parameterType), statement.variable);
        this.analyzeStatement(statement.body);
        this.popScope();
        break;
      }
      case "SwitchStatement":
        this.expressionType(statement.discriminant);
        statement.cases.forEach((caseNode) => {
          if (caseNode.test) this.expressionType(caseNode.test);
          caseNode.statements.forEach((child) => this.analyzeStatement(child));
        });
        break;
      case "ReturnStatement": {
        const expected = this.currentMethod?.type === "ConstructorDeclaration" ? JAVA_TYPES.VOID : typeFromReference(this.currentMethod?.returnType);
        const actual = statement.argument ? this.expressionType(statement.argument) : JAVA_TYPES.VOID;
        if (expected === JAVA_TYPES.VOID && statement.argument) this.error(statement, "SEM_VOID_RETURN_VALUE", "A void method cannot return a value.");
        else if (expected !== JAVA_TYPES.VOID && !statement.argument) this.error(statement, "SEM_MISSING_RETURN_VALUE", "A non-void method must return a value.");
        else if (statement.argument) this.ensureAssignable(expected, actual, statement.argument, "Returned value is not compatible with the method return type.");
        break;
      }
      case "ThrowStatement":
        this.expressionType(statement.argument);
        break;
      case "TryStatement":
        this.analyzeStatement(statement.block);
        statement.handlers.forEach((handler) => {
          this.pushScope();
          this.declare(handler.parameter.name, typeFromReference(handler.parameter.parameterType), handler.parameter);
          this.analyzeStatement(handler.body);
          this.popScope();
        });
        this.analyzeStatement(statement.finalizer);
        break;
      default:
        break;
    }
  }

  analyzeVariableDeclaration(node) {
    const declaredType = typeFromReference(node.variableType);
    this.checkKnownType(declaredType, node.variableType);
    for (const declarator of node.declarators) {
      const type = arrayType(declaredType, declarator.arrayDimensions);
      if (declarator.initializer?.type === "ArrayInitializer") this.checkArrayInitializer(type, declarator.initializer);
      else if (declarator.initializer) this.ensureAssignable(type, this.expressionType(declarator.initializer), declarator.initializer, `Cannot assign value to '${declarator.name}'.`);
      this.declare(declarator.name, type, declarator);
    }
  }

  checkArrayInitializer(targetType, initializer) {
    if (!isArrayType(targetType)) {
      this.error(initializer, "SEM_EXPECTED_ARRAY", "An array initializer requires an array declaration.");
      return;
    }
    const expectedElementType = elementTypeOf(targetType);
    for (const element of initializer.elements) {
      if (element.type === "ArrayInitializer" && isArrayType(expectedElementType)) this.checkArrayInitializer(expectedElementType, element);
      else this.ensureAssignable(expectedElementType, this.expressionType(element), element, "Array element is not compatible with the declared type.");
    }
  }

  expressionType(expression) {
    if (!expression) return JAVA_TYPES.VOID;
    let type = JAVA_TYPES.UNKNOWN;
    switch (expression.type) {
      case "Literal":
        type = literalType(expression);
        break;
      case "Identifier":
        type = this.lookup(expression.name, expression);
        break;
      case "ThisExpression":
      case "SuperExpression":
        type = this.currentClass?.node.name || JAVA_TYPES.ERROR;
        break;
      case "ParenthesizedExpression":
        type = this.expressionType(expression.expression);
        break;
      case "UnaryExpression":
      case "UpdateExpression":
        type = this.expressionType(expression.argument);
        if (["!"].includes(expression.operator)) {
          this.ensureBoolean(type, expression.argument);
          type = JAVA_TYPES.BOOLEAN;
        } else if (!isNumericType(type) && type !== JAVA_TYPES.ERROR) {
          this.error(expression, "SEM_EXPECTED_NUMBER", `Operator '${expression.operator}' requires a numeric value.`);
          type = JAVA_TYPES.ERROR;
        }
        break;
      case "BinaryExpression":
        type = this.binaryType(expression);
        break;
      case "InstanceOfExpression":
        this.expressionType(expression.left);
        type = JAVA_TYPES.BOOLEAN;
        break;
      case "ConditionalExpression": {
        this.ensureBoolean(this.expressionType(expression.test), expression.test);
        const left = this.expressionType(expression.consequent);
        const right = this.expressionType(expression.alternate);
        type = left === right ? left : numericPromotion(left, right);
        if (type === JAVA_TYPES.ERROR) this.error(expression, "SEM_INCOMPATIBLE_CONDITIONAL", "Conditional branches must have compatible types.");
        break;
      }
      case "AssignmentExpression":
        type = this.assignmentType(expression);
        break;
      case "MemberExpression":
        type = this.memberType(expression);
        break;
      case "CallExpression":
        type = this.callType(expression);
        break;
      case "NewExpression":
        type = typeFromReference(expression.constructorType);
        this.checkKnownType(type, expression.constructorType);
        expression.arguments.forEach((argument) => this.expressionType(argument));
        break;
      case "NewArrayExpression":
        expression.dimensions.filter(Boolean).forEach((dimension) => this.ensureNumeric(this.expressionType(dimension), dimension));
        expression.initializer?.elements.forEach((element) => this.expressionType(element));
        type = arrayType(typeFromReference(expression.elementType), expression.dimensions.length);
        break;
      case "ArrayInitializer":
        expression.elements.forEach((element) => this.expressionType(element));
        type = JAVA_TYPES.UNKNOWN;
        break;
      default:
        type = JAVA_TYPES.ERROR;
    }
    expression.semanticType = type;
    return type;
  }

  binaryType(expression) {
    const left = this.expressionType(expression.left);
    const right = this.expressionType(expression.right);
    const operator = expression.operator;
    if (operator === "+" && (left === JAVA_TYPES.STRING || right === JAVA_TYPES.STRING)) return JAVA_TYPES.STRING;
    if (["+", "-", "*", "/", "%", "<<", ">>", ">>>", "&", "|", "^"].includes(operator)) {
      const type = numericPromotion(left, right);
      if (type === JAVA_TYPES.ERROR) this.error(expression, "SEM_EXPECTED_NUMBER", `Operator '${operator}' requires numeric operands.`);
      return type;
    }
    if (["<", ">", "<=", ">="].includes(operator)) {
      if (numericPromotion(left, right) === JAVA_TYPES.ERROR) this.error(expression, "SEM_EXPECTED_NUMBER", `Operator '${operator}' requires numeric operands.`);
      return JAVA_TYPES.BOOLEAN;
    }
    if (["==", "!="].includes(operator)) {
      if (!isAssignable(left, right) && !isAssignable(right, left)) this.error(expression, "SEM_INCOMPATIBLE_COMPARISON", "Values in an equality comparison must be compatible.");
      return JAVA_TYPES.BOOLEAN;
    }
    if (["&&", "||"].includes(operator)) {
      this.ensureBoolean(left, expression.left);
      this.ensureBoolean(right, expression.right);
      return JAVA_TYPES.BOOLEAN;
    }
    return JAVA_TYPES.ERROR;
  }

  assignmentType(expression) {
    const target = this.expressionType(expression.left);
    const source = this.expressionType(expression.right);
    this.ensureAssignable(target, source, expression.right, "Assigned value is not compatible with the target.");
    return target;
  }

  memberType(expression) {
    const objectType = this.expressionType(expression.object);
    if (expression.computed) {
      this.ensureNumeric(this.expressionType(expression.property), expression.property);
      if (!isArrayType(objectType)) this.error(expression, "SEM_EXPECTED_ARRAY", "Array indexing requires an array value.");
      return isArrayType(objectType) ? elementTypeOf(objectType) : JAVA_TYPES.ERROR;
    }
    if (expression.property === "length" && (isArrayType(objectType) || objectType === JAVA_TYPES.STRING)) return JAVA_TYPES.INT;
    if (objectType === this.currentClass?.node.name && this.currentClass.fields.has(expression.property)) return this.currentClass.fields.get(expression.property).type;
    return JAVA_TYPES.UNKNOWN;
  }

  callType(expression) {
    const path = memberPath(expression.callee);
    const argumentTypes = expression.arguments.map((argument) => this.expressionType(argument));
    if (["System.out.print", "System.out.println", "System.err.print", "System.err.println"].includes(path)) return JAVA_TYPES.VOID;
    if (path.startsWith("Math.")) return JAVA_TYPES.DOUBLE;
    if (expression.callee.type === "MemberExpression") {
      const receiverType = this.expressionType(expression.callee.object);
      if (receiverType === "Scanner" && expression.callee.property in SCANNER_RETURN_TYPES) return SCANNER_RETURN_TYPES[expression.callee.property];
      if (expression.callee.property === "equals") return JAVA_TYPES.BOOLEAN;
      if (["length", "charAt", "substring", "toUpperCase", "toLowerCase", "contains"].includes(expression.callee.property)) {
        return ({ length: JAVA_TYPES.INT, charAt: JAVA_TYPES.CHAR, substring: JAVA_TYPES.STRING, toUpperCase: JAVA_TYPES.STRING, toLowerCase: JAVA_TYPES.STRING, contains: JAVA_TYPES.BOOLEAN })[expression.callee.property];
      }
    }
    if (expression.callee.type === "Identifier") {
      const method = this.currentClass?.methods.get(expression.callee.name);
      if (method) {
        this.checkArgumentCount(method, argumentTypes.length, expression);
        return method.returnType;
      }
    }
    return JAVA_TYPES.UNKNOWN;
  }

  checkArgumentCount(method, count, node) {
    if (method.parameters.length !== count) this.error(node, "SEM_ARGUMENT_COUNT", `Method '${method.node.name}' expects ${method.parameters.length} argument${method.parameters.length === 1 ? "" : "s"}, but received ${count}.`);
  }

  lookup(name, node) {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      if (this.scopes[index].has(name)) return this.scopes[index].get(name).type;
    }
    if (this.currentClass?.fields.has(name)) {
      const field = this.currentClass.fields.get(name);
      node.resolvedKind = "field";
      node.fieldIsStatic = field.static;
      return field.type;
    }
    if (this.classes.has(name) || BUILTIN_CLASSES.has(name)) return name;
    this.error(node, "SEM_UNDEFINED_NAME", `Cannot find symbol '${name}'.`);
    return JAVA_TYPES.ERROR;
  }

  declare(name, type, node) {
    const scope = this.scopes.at(-1);
    if (scope.has(name)) this.error(node, "SEM_DUPLICATE_VARIABLE", `Variable '${name}' is already declared in this scope.`);
    else scope.set(name, { type, node });
  }

  checkKnownType(type, node) {
    const base = isArrayType(type) ? type.replace(/\[\]/g, "") : type;
    if (![JAVA_TYPES.VOID, ...Object.values(JAVA_TYPES)].includes(base) && !this.isKnownClass(base)) this.error(node, "SEM_UNKNOWN_TYPE", `Unknown type '${base}'.`);
  }

  isKnownClass(name) { return this.classes.has(name) || BUILTIN_CLASSES.has(name); }
  ensureAssignable(target, source, node, message) { if (!isAssignable(target, source)) this.error(node, "SEM_INCOMPATIBLE_TYPES", `${message} Expected '${target}', found '${source}'.`); }
  ensureBoolean(type, node) { if (type !== JAVA_TYPES.BOOLEAN && type !== JAVA_TYPES.ERROR) this.error(node, "SEM_EXPECTED_BOOLEAN", "Condition must have type boolean."); }
  ensureNumeric(type, node) { if (!isNumericType(type) && type !== JAVA_TYPES.ERROR) this.error(node, "SEM_EXPECTED_NUMBER", "Expected a numeric value."); }
  pushScope() { this.scopes.push(new Map()); }
  popScope() { this.scopes.pop(); }
  error(node, code, message) { this.diagnostics.push(createDiagnostic({ phase: "semantic", code, message, start: node.loc.start, end: node.loc.end })); }
}

function literalType(node) {
  return ({ INTEGER_LITERAL: JAVA_TYPES.INT, FLOAT_LITERAL: node.raw.endsWith("f") || node.raw.endsWith("F") ? JAVA_TYPES.FLOAT : JAVA_TYPES.DOUBLE, STRING_LITERAL: JAVA_TYPES.STRING, CHAR_LITERAL: JAVA_TYPES.CHAR, BOOLEAN_LITERAL: JAVA_TYPES.BOOLEAN, NULL_LITERAL: JAVA_TYPES.NULL })[node.literalType] || JAVA_TYPES.ERROR;
}

function memberPath(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression" || node.computed) return "";
  const base = memberPath(node.object);
  return base ? `${base}.${node.property}` : "";
}

