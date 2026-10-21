export const DEFAULT_SOURCE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Welcome to JavaLab!");
    }
}
`;

export function createEditorState({ source = DEFAULT_SOURCE, filename = "Main.java" } = {}) {
  return {
    filename,
    source,
    savedSource: source,
    history: [source],
    historyIndex: 0,
  };
}

export function isDirty(state) {
  return state.source !== state.savedSource;
}

export function updateSource(state, source) {
  if (source === state.source) return state;

  const history = state.history.slice(0, state.historyIndex + 1);
  history.push(source);
  const trimmedHistory = history.slice(-100);

  return {
    ...state,
    source,
    history: trimmedHistory,
    historyIndex: trimmedHistory.length - 1,
  };
}

export function markSaved(state) {
  return { ...state, savedSource: state.source };
}

export function undo(state) {
  if (state.historyIndex === 0) return state;
  const historyIndex = state.historyIndex - 1;
  return { ...state, historyIndex, source: state.history[historyIndex] };
}

export function redo(state) {
  if (state.historyIndex >= state.history.length - 1) return state;
  const historyIndex = state.historyIndex + 1;
  return { ...state, historyIndex, source: state.history[historyIndex] };
}

