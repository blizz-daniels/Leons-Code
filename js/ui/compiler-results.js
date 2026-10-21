export function renderDiagnostics({ list, summary }, diagnostics) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const parts = [];
  if (errors.length) parts.push(`${errors.length} error${errors.length === 1 ? "" : "s"}`);
  if (warnings.length) parts.push(`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
  summary.textContent = parts.length ? parts.join(", ") : "No diagnostics";
  list.replaceChildren();

  if (!diagnostics.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No diagnostics. Parsing and supported semantic checks completed successfully.";
    list.append(empty);
    return;
  }

  for (const diagnostic of diagnostics) {
    const row = document.createElement("article");
    row.className = `diagnostic diagnostic--${diagnostic.severity}`;
    const heading = document.createElement("strong");
    heading.textContent = `${diagnostic.severity} · ${diagnostic.code}`;
    const location = document.createElement("span");
    location.textContent = `Ln ${diagnostic.start.line}, Col ${diagnostic.start.column}`;
    const message = document.createElement("p");
    message.textContent = diagnostic.message;
    row.append(heading, location, message);
    list.append(row);
  }
}

export function renderAst(container, ast) {
  container.replaceChildren();
  const code = document.createElement("pre");
  code.className = "ast-output";
  code.textContent = JSON.stringify(ast, null, 2);
  container.append(code);
}

