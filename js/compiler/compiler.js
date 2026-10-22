import { FEATURE_SUPPORT } from "./feature-support.js";
import { createDiagnostic, hasErrors } from "./diagnostics.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { analyze } from "./semantic-analyzer.js";
import { translate } from "./translator.js";

export const MAX_SOURCE_LENGTH = 200_000;

export function compile(source) {
  if (typeof source !== "string") return inputFailure("COMP_INVALID_SOURCE", "Compiler input must be Java source text.");
  if (source.length > MAX_SOURCE_LENGTH) return inputFailure(
    "COMP_SOURCE_TOO_LARGE",
    `Source exceeds JavaLab's ${MAX_SOURCE_LENGTH.toLocaleString()} character limit. Split the exercise into a smaller example.`,
  );
  const lexicalResult = lex(source);
  const parsedResult = parse(lexicalResult.tokens);
  let diagnostics = [...lexicalResult.diagnostics, ...parsedResult.diagnostics];
  let semanticResult = { diagnostics: [], symbols: { classes: [] } };
  let translationResult = null;
  if (!hasErrors(diagnostics)) {
    semanticResult = analyze(parsedResult.ast);
    diagnostics = [...diagnostics, ...semanticResult.diagnostics];
  }
  if (!hasErrors(diagnostics)) {
    translationResult = translate(parsedResult.ast);
    const syntaxDiagnostic = validateGeneratedJavaScript(translationResult.code);
    if (syntaxDiagnostic) diagnostics.push(syntaxDiagnostic);
  }
  const errors = hasErrors(diagnostics);
  const unsupportedFeatures = diagnostics
    .filter((diagnostic) => diagnostic.code.startsWith("PARSE_UNSUPPORTED"))
    .map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message, start: diagnostic.start }));

  return {
    status: errors ? "error" : "compiled",
    stage: errors ? (lexicalResult.diagnostics.length || parsedResult.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "syntax" : "semantic") : "translation",
    tokens: lexicalResult.tokens,
    ast: parsedResult.ast,
    diagnostics,
    unsupportedFeatures,
    generatedJavaScript: translationResult?.code || null,
    sourceMap: null,
    runtimeMetadata: translationResult?.metadata || null,
    symbols: semanticResult.symbols,
    featureSupport: FEATURE_SUPPORT,
  };
}

export function validateGeneratedJavaScript(source) {
  try {
    // The translation is an async IIFE, so parsing it as a function body checks
    // exactly the syntax the isolated execution script will receive.
    new Function(String(source));
    return null;
  } catch (error) {
    const line = Number.isInteger(error?.lineNumber) && error.lineNumber > 0 ? error.lineNumber : 1;
    const column = Number.isInteger(error?.columnNumber) && error.columnNumber > 0 ? error.columnNumber : 1;
    const point = { line, column, offset: 0 };
    return createDiagnostic({
      phase: "translation",
      code: "TRANSLATE_INVALID_JAVASCRIPT",
      message: `Generated JavaScript failed syntax validation: ${String(error?.message || error)}`,
      start: point,
      end: point,
    });
  }
}

function inputFailure(code, message) {
  const point = { line: 1, column: 1, offset: 0 };
  const diagnostic = createDiagnostic({ phase: "compiler", code, message, start: point, end: point });
  return {
    status: "error",
    stage: "input",
    tokens: [{ type: "EOF", lexeme: "", value: null, start: point, end: point }],
    ast: { type: "CompilationUnit", declarations: [], loc: { start: point, end: point } },
    diagnostics: [diagnostic],
    unsupportedFeatures: [],
    generatedJavaScript: null,
    sourceMap: null,
    runtimeMetadata: null,
    symbols: { classes: [] },
    featureSupport: FEATURE_SUPPORT,
  };
}

