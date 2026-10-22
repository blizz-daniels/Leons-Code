import { defaultValueFor } from "./java-types.js";
import { JavaScanner } from "./java-io.js";

export const MAX_ARRAY_ELEMENTS = 100_000;

export function createJavaRuntime({ onOutput = () => {}, requestInput = async () => null, deadline = Date.now() + 3000, args = [], maxOutput = 10_000 } = {}) {
  let outputSize = 0;
  let computationDeadline = deadline;
  const requestJavaInput = async (mode) => {
    const pausedAt = Date.now();
    const value = await requestInput(mode);
    computationDeadline += Math.max(0, Date.now() - pausedAt);
    return value;
  };
  const emit = (kind, values) => {
    const text = values.map(javaString).join("");
    outputSize += text.length;
    if (outputSize > maxOutput) throw new Error("Program output exceeded the JavaLab limit.");
    onOutput({ kind, text });
  };
  return {
    args,
    print: (...values) => emit("out", values),
    println: (...values) => emit("out", [`${values.map(javaString).join("")}\n`]),
    error: (...values) => emit("err", values),
    errorln: (...values) => emit("err", [`${values.map(javaString).join("")}\n`]),
    binary,
    defaultValue: (type) => defaultValueFor(type),
    createArray,
    arrayFromInitializer,
    stringEquals: (left, right) => String(left) === String(right),
    stringLength: (value) => String(value).length,
    stringContains: (value, search) => String(value).includes(String(search)),
    stringCharAt,
    stringSubstring,
    stringUpper: (value) => String(value).toUpperCase(),
    stringLower: (value) => String(value).toLowerCase(),
    createScanner: () => new JavaScanner(requestJavaInput),
    scannerCall: async (scanner, method) => {
      if (!(scanner instanceof JavaScanner) || typeof scanner[method] !== "function") throw new Error(`No supported Scanner method named '${method}'.`);
      return scanner[method]();
    },
    math: createMathRuntime(),
    checkExecution: () => {
      if (Date.now() > computationDeadline) throw new Error("Execution timed out after the configured limit.");
    },
    unsupported: (message) => { throw new Error(message); },
  };
}

export function binary(operator, left, right, type = "int") {
  if (operator === "+" && (type === "String" || typeof left === "string" || typeof right === "string")) return javaString(left) + javaString(right);
  if (operator === "/" && ["byte", "short", "int", "long", "char"].includes(type)) {
    if (Number(right) === 0) throw new Error("ArithmeticException: / by zero");
    return toInt(Math.trunc(Number(left) / Number(right)));
  }
  const numeric = {
    "+": () => Number(left) + Number(right),
    "-": () => Number(left) - Number(right),
    "*": () => Number(left) * Number(right),
    "%": () => {
      if (Number(right) === 0) throw new Error("ArithmeticException: / by zero");
      return Number(left) % Number(right);
    },
  }[operator];
  if (!numeric) throw new Error(`Unsupported arithmetic operator '${operator}'.`);
  const value = numeric();
  return ["byte", "short", "int", "long", "char"].includes(type) ? toInt(value) : value;
}

export function createArray(dimensions, type) {
  return createBoundedArray(dimensions, type, { remaining: MAX_ARRAY_ELEMENTS });
}

export function arrayFromInitializer(values) {
  if (!Array.isArray(values) || values.length > MAX_ARRAY_ELEMENTS) throw new RangeError(`Array allocation exceeds JavaLab's ${MAX_ARRAY_ELEMENTS.toLocaleString()} element limit.`);
  return values;
}

function createBoundedArray(dimensions, type, budget) {
  if (!Array.isArray(dimensions)) throw new TypeError("Array dimensions must be an array.");
  const [length = 0, ...rest] = dimensions;
  const safeLength = Math.max(0, toInt(length));
  if (safeLength > budget.remaining) throw new RangeError(`Array allocation exceeds JavaLab's ${MAX_ARRAY_ELEMENTS.toLocaleString()} element limit.`);
  budget.remaining -= safeLength;
  return Array.from({ length: safeLength }, () => rest.length ? createBoundedArray(rest, type, budget) : defaultValueFor(type));
}

export function javaString(value) {
  if (value === null) return "null";
  if (value === true) return "true";

  if (value === false) return "false";
  return String(value);
}
export function createMathRuntime() {
  return Object.freeze({
    E: Math.E,
    PI: Math.PI,
    abs: Math.abs,
    ceil: Math.ceil,
    cos: Math.cos,
    floor: Math.floor,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    random: Math.random,
    round: (value) => Math.floor(Number(value) + 0.5),
    sin: Math.sin,
    sqrt: Math.sqrt,
  });
}

function stringCharAt(value, index) {
  const string = String(value);
  const position = toInt(index);
  if (position < 0 || position >= string.length) throw new Error(`StringIndexOutOfBoundsException: ${position}`);
  return string.charAt(position);
}

function stringSubstring(value, start, end = undefined) {
  const string = String(value);
  const from = toInt(start);
  const to = end === undefined ? string.length : toInt(end);
  if (from < 0 || to < from || to > string.length) throw new Error(`StringIndexOutOfBoundsException: ${from}, ${to}`);
  return string.slice(from, to);
}

function toInt(value) {
  return Number(value) | 0;
}

