# Phase 6 security, testing, and deployment

JavaLab is a static learning environment, not a general Java execution service. Phase 6 strengthens the boundaries around the deliberately small supported subset.

## Execution boundary

- Generated JavaScript runs in an iframe with `sandbox="allow-scripts"`, which gives it an opaque origin and no same-origin access to JavaLab.
- The iframe uses an inline content-security policy that blocks network connections, forms, plugins, workers, media, fonts, images, and framing. It also uses a no-referrer policy.
- The parent accepts only session-bound messages from the active iframe window. It validates message shape, output kind, Scanner request identifiers, and bounded error text before changing the UI.
- Stop, replacement, completion, runtime errors, and elapsed-time expiry all remove the iframe and clear its timer. The generated loop checks cooperate with the deadline; the parent also tears down a session after at most 10 seconds.
- The runtime bridge is frozen inside the iframe. It exposes only the documented JavaLab helpers.

## Resource limits

- Java source is limited to 200,000 characters before lexing.
- A program may emit at most 10,000 output characters.
- Scanner input is limited to 65,536 characters per entry and 32 queued entries.
- A single array allocation, including nested dimensions, may contain at most 100,000 elements.
- Configured execution time is clamped to 100 milliseconds through 10 seconds.

The limits protect responsiveness and are reported as compiler or runtime errors. They are not a claim that arbitrary JavaScript is safe to execute; JavaLab only executes JavaScript produced by its own compiler in the sandboxed iframe.

## Verification

`npm test` includes compiler, parser, semantic-analysis, runtime, sandbox, Scanner, cancellation, protocol-validation, resource-limit, and end-to-end tests. The sandbox tests verify restrictive CSP directives and that source containing a closing-script sequence remains data rather than escaping the execution document.

## GitHub Pages

The included [Pages workflow](../.github/workflows/pages.yml) deploys the repository root as a static site whenever `main` is updated, or when it is started manually. In the GitHub repository, set **Settings > Pages > Build and deployment > Source** to **GitHub Actions**. If the repository uses a branch other than `main`, update the workflow trigger to that branch.

The site uses relative module and asset paths, needs no backend or package installation, and is suitable for a project Pages URL. Deploy only the repository source; local browser projects and session data intentionally remain in each browser's storage.
