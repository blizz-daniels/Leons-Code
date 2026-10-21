import { defaultValueFor } from "./java-types.js";
import { JavaScanner } from "./java-io.js";

export function createJavaRuntime({ onOutput = () => {}, requestInput = async () => null, deadline = Date.now() + 3000, args = [], maxOutput = 10_000 } = {}) {
  let outputSize = 0;
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
    arrayFromInitializer: (values) => values,
    stringEquals: (left, right) => String(left) === String(right),
    stringLength: (value) => String(value).length,
    math: Math,
    checkExecution: () => {
      if (Date.now() > deadline) throw new Error("Execution timed out after the configured limit.");
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
  const [length = 0, ...rest] = dimensions;
  const safeLength = Math.max(0, toInt(length));
  return Array.from({ length: safeLength }, () => rest.length ? createArray(rest, type) : defaultValueFor(type));
}

export function javaString(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  return String(value);
}

function toInt(value) {
  return Number(value) | 0;
}

