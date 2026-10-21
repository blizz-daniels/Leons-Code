import { FEATURE_SUPPORT } from "./feature-support.js";
import { hasErrors } from "./diagnostics.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { analyze } from "./semantic-analyzer.js";
import { translate } from "./translator.js";

export function compile(source) {
  const lexicalResult = lex(source);
  const parsedResult = parse(lexicalResult.tokens);
  let diagnostics = [...lexicalResult.diagnostics, ...parsedResult.diagnostics];
  let semanticResult = { diagnostics: [], symbols: { classes: [] } };
  let translationResult = null;
  if (!hasErrors(diagnostics)) {
    semanticResult = analyze(parsedResult.ast);
    diagnostics = [...diagnostics, ...semanticResult.diagnostics];
  }
  if (!hasErrors(diagnostics)) translationResult = translate(parsedResult.ast);
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

