# JavaLab

JavaLab is a static, browser-based learning environment that will translate a documented subset of Java into JavaScript using its own lexer, parser, semantic analysis, translator, and runtime. It is designed for GitHub Pages and does not require a production backend.

## Current status: Phase 1 — Foundation complete

The project currently provides a responsive Java workspace with:

- A dark/light theme, keyboard-accessible panels, and mobile layout.
- A Java editor with line numbers, lightweight syntax highlighting, auto-indentation, Tab/outdent behavior, undo/redo, find/replace, and an unsaved-change indicator.
- An output console that preserves scroll position when the user has scrolled away from the latest output.
- An input queue UI, diagnostics area, and compiler-inspection panels, all clearly marked as pending until their backing compiler/runtime functionality exists.
- Browser-session saving using `localStorage`; multi-project persistence is scheduled for Phase 5.
- A dependency-free Node test setup for the editor state and syntax-highlighting utilities.

No Java program is compiled or executed yet. The Run and Check controls explicitly report this rather than fabricating a compile result. The custom lexer, parser, compiler facade, translator, and runtime start in later phases.

## Run locally

Use any static HTTP server from the project directory. For example, with Python installed:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`. Do not rely on `file://` because JavaScript ES modules require an HTTP(S) origin in common browsers.

## Test

The tests use Node's built-in test runner; no npm packages are required.

```sh
npm test
```

## Planned feature progression

1. **Foundation (complete):** UI, editor, console, and test infrastructure.
2. **Compiler foundation:** custom lexer, AST, parser, source positions, syntax diagnostics, and compiler tests.
3. **Executable Java subset:** semantic analysis, Java-to-JavaScript translation, compatible primitive operations, and controlled execution.
4. **Input and standard library:** Scanner, arrays, String/Math operations, and exceptions.
5. **Learning tools:** examples, local projects, translation/AST inspectors, documentation, and stronger feedback.
6. **Security, testing, and deployment:** isolation review, cancellation/timeouts, full suite, and GitHub Pages validation.

## Deployment

The application uses relative paths and browser-native ES modules, so it can be published from the repository root with GitHub Pages. When later phases are complete, select the repository's deployment branch and `/ (root)` in **Settings → Pages**. The included `.nojekyll` file prevents Jekyll processing from interfering with static assets.

## Security and limitations

Phase 1 does not execute any user program, so it creates no code-execution boundary. The future execution engine will use a documented isolated-message design and must not use direct `eval()` or `new Function()` in the main application context. Java compatibility is not claimed at this stage.

