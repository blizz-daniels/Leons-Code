# JavaLab

JavaLab is a static, browser-based learning environment that will translate a documented subset of Java into JavaScript using its own lexer, parser, semantic analysis, translator, and runtime. It is designed for GitHub Pages and does not require a production backend.

## Current status: Phase 6 — Security, testing, and deployment complete

The project currently provides:

- A responsive Java workspace with editor, console, session saving, syntax highlighting, and compiler inspectors.
- A custom lexer, parser, AST, source diagnostics, semantic analysis, JavaScript translator, and generated-code view.
- A hardened isolated iframe execution engine with cancellation, bounded source/input/output/array resources, time limits, and validated session messages.
- Interactive `Scanner` input through the program-input panel, typed arrays, selected `String`/`Math` calls, and exception handling.
- Fifteen verified starter examples plus browser-local save, open, rename, delete, import, export, and generated-JavaScript download workflows.
- A dependency-free Node test suite that covers editor behavior, compiler stages, runtime behavior, and end-to-end Java programs.
- A documented learning subset rather than a full Java VM or JDK.
- A GitHub Pages deployment workflow and documented execution-boundary limitations.

Run compiles the supported subset and executes it in the isolated sandbox. Check shows diagnostics, AST data, and the generated JavaScript.

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
2. **Compiler foundation (complete):** custom lexer, AST, parser, source positions, syntax diagnostics, and compiler tests.
3. **Executable Java subset (complete):** semantic analysis, Java-to-JavaScript translation, compatible primitive operations, and controlled execution.
4. **Input and standard library (complete):** Scanner, arrays, String/Math operations, and exceptions.
5. **Learning tools (complete):** tested starter examples, browser-local projects, translation/AST inspectors, documentation, and stronger feedback.
6. **Security, testing, and deployment (complete):** isolation review, cancellation/timeouts, resource limits, expanded tests, and GitHub Pages workflow.

## Deployment

The application uses relative paths and browser-native ES modules, so it can be published on GitHub Pages without a build step. The included workflow deploys `main`; in the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. See `docs/phase-6-security-and-deployment.md` for the exact setup.

## Security and limitations

Programs run in a sandboxed iframe with a narrow validated message protocol, strict CSP, execution deadline, and resource limits. The main application does not directly evaluate generated user code. Java compatibility is deliberately limited to the documented subset in `docs/`; the sandbox is a defense-in-depth boundary, not a claim that arbitrary JavaScript is safe.

