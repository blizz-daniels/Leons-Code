# Leon’s Code implementation plan

## Audit completed

- The inherited project is a static Java learning emulator: lexer, parser, AST, semantic analyser, JavaScript translator, isolated iframe runtime, editor, local project storage, and 51 pre-existing Node tests.
- It was not a PHP application and had no database, authentication, course records, payment service, or server-side routes.
- The execution sandbox is preserved. It uses `sandbox="allow-scripts"`, restrictive CSP, session-bound messages, output/source/input limits, and a parent-controlled timeout. Student Java is never run on PHP.
- The previously reported floating-point `/` runtime defect was corrected in both runtime implementations and given regression coverage.

## Delivered foundation

1. PHP 8.3 application bootstrap, environment configuration, secure sessions, CSRF helpers, security headers, error logging, PDO database connection, auth, roles, and database-backed rate limiting.
2. Versioned MySQL schema, seed curriculum, controlled administrator bootstrap command, and database-backed course, lesson, enrolment, progress, plans, payment, and audit entities.
3. Public pages, authentication, catalogue, learning dashboard, lesson access checks, pricing, coding lab links, a sandboxed web playground, and role-protected administration summary.
4. Paystack test-mode architecture: server-created pending payments, hosted checkout initialization, server-side verification, HMAC-SHA512 webhook validation, idempotent event intake, and verified-only access grants.

## Remaining launch work

- Configure a real MySQL database and run migration/seed commands.
- Provide email transport before enabling verification and password-reset delivery.
- Add Paystack test keys, create corresponding Paystack plans, and exercise a test transaction/webhook before allowing live billing.
- Expand the seeded course material through the administrator CMS controls; creation/editing screens are the next administration slice.
- Run accessibility/browser QA in the target host and obtain legal/privacy review before making compliance claims.
