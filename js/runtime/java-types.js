const PRIMITIVE_TYPES = new Set(["byte", "short", "int", "long", "float", "double", "char", "boolean"]);
const NUMERIC_TYPES = new Set(["byte", "short", "int", "long", "float", "double", "char"]);

export const JAVA_TYPES = Object.freeze({
  BYTE: "byte",
  SHORT: "short",
  INT: "int",
  LONG: "long",
  FLOAT: "float",
  DOUBLE: "double",
  CHAR: "char",
  BOOLEAN: "boolean",
  STRING: "String",
  VOID: "void",
  NULL: "null",
  UNKNOWN: "<unknown>",
  ERROR: "<error>",
});

export function arrayType(elementType, dimensions = 1) {
  return `${elementType}${"[]".repeat(dimensions)}`;
}

export function isArrayType(type) {
  return typeof type === "string" && type.endsWith("]");
}

export function elementTypeOf(type) {
  return isArrayType(type) ? type.slice(0, -2) : JAVA_TYPES.ERROR;
}

export function isNumericType(type) {
  return NUMERIC_TYPES.has(type);
}

export function isPrimitiveType(type) {
  return PRIMITIVE_TYPES.has(type);
}

export function isReferenceType(type) {
  return type === JAVA_TYPES.STRING || isArrayType(type) || (!isPrimitiveType(type) && ![JAVA_TYPES.VOID, JAVA_TYPES.NULL, JAVA_TYPES.UNKNOWN, JAVA_TYPES.ERROR].includes(type));
}

export function numericPromotion(left, right) {
  if (!isNumericType(left) || !isNumericType(right)) return JAVA_TYPES.ERROR;
  if (left === JAVA_TYPES.DOUBLE || right === JAVA_TYPES.DOUBLE) return JAVA_TYPES.DOUBLE;
  if (left === JAVA_TYPES.FLOAT || right === JAVA_TYPES.FLOAT) return JAVA_TYPES.FLOAT;
  if (left === JAVA_TYPES.LONG || right === JAVA_TYPES.LONG) return JAVA_TYPES.LONG;
  return JAVA_TYPES.INT;
}

export function isAssignable(target, source) {
  if (target === source || source === JAVA_TYPES.ERROR || target === JAVA_TYPES.ERROR) return true;
  if (source === JAVA_TYPES.NULL) return isReferenceType(target);
  if (isNumericType(target) && isNumericType(source)) return numericRank(source) <= numericRank(target);
  return false;
}

export function typeFromReference(reference) {
  if (!reference) return JAVA_TYPES.ERROR;
  return reference.arrayDimensions ? arrayType(reference.name, reference.arrayDimensions) : reference.name;
}

export function defaultValueFor(type) {
  if (type === JAVA_TYPES.BOOLEAN) return false;
  if (type === JAVA_TYPES.CHAR) return "\0";
  if (isNumericType(type)) return 0;
  return null;
}

function numericRank(type) {
  return [JAVA_TYPES.BYTE, JAVA_TYPES.SHORT, JAVA_TYPES.CHAR, JAVA_TYPES.INT, JAVA_TYPES.LONG, JAVA_TYPES.FLOAT, JAVA_TYPES.DOUBLE].indexOf(type);
}

