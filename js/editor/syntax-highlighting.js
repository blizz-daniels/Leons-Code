const TOKEN_PATTERN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b(?:abstract|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|new|package|private|protected|public|return|short|static|super|switch|this|throw|throws|try|void|while)\b|\b(?:String|System|Math|Scanner|Integer|Double|Boolean|Object)\b|\b(?:true|false)\b|\bnull\b|\b\d+(?:\.\d+)?(?:[fFdDlL])?\b|@[A-Za-z_$][\w$]*)/g;

export function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function highlightJava(source) {
  let result = "";
  let lastIndex = 0;

  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const [token] = match;
    result += escapeHtml(source.slice(lastIndex, match.index));
    result += `<span class="${tokenClass(token)}">${escapeHtml(token)}</span>`;
    lastIndex = match.index + token.length;
  }

  return result + escapeHtml(source.slice(lastIndex));
}

function tokenClass(token) {
  if (token.startsWith("//") || token.startsWith("/*")) return "token-comment";
  if (token.startsWith('"')) return "token-string";
  if (token.startsWith("'")) return "token-char";
  if (token.startsWith("@")) return "token-annotation";
  if (token === "true" || token === "false") return "token-boolean";
  if (token === "null") return "token-null";
  if (/^\d/.test(token)) return "token-number";
  if (/^(String|System|Math|Scanner|Integer|Double|Boolean|Object)$/.test(token)) return "token-type";
  return "token-keyword";
}

