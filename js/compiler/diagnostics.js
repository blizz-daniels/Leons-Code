export function createDiagnostic({
  phase,
  code,
  message,
  severity = "error",
  start,
  end = start,
}) {
  return { phase, code, message, severity, start, end };
}

export function hasErrors(diagnostics) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatDiagnostic(diagnostic) {
  const location = diagnostic.start ? `Ln ${diagnostic.start.line}, Col ${diagnostic.start.column}` : "Unknown location";
  return `${location}: ${diagnostic.message}`;
}

