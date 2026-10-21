export function setDiagnosticMessage({ list, summary }, message, level = "info") {
  summary.textContent = level === "info" ? "No diagnostics" : `1 ${level}`;
  list.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  list.append(paragraph);
}

