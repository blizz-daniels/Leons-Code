# Leon’s Code

Leon’s Code is a PHP/MySQL learning platform built around the inherited Java learning emulator. It gives beginners a public course catalogue, secure student accounts, database-backed learning progress, plan display, an isolated Java lab, and an isolated HTML/CSS/JavaScript playground.

The Java Lab remains a deliberate learning subset—not a full JDK. Student Java is translated by the existing lexer, parser, AST, semantic checker, and translator, then runs only inside a sandboxed iframe. It never runs on PHP or receives database, cookie, DOM, or payment access.

## What is included

- Responsive public homepage, course catalogue, course details, pricing, legal starter pages, and accessible navigation.
- Database-backed courses, modules, lessons, enrolment, lesson completion, dashboard progress, plans, subscriptions, payments, and audit-ready records.
- Registration, login, logout, secure sessions, password hashing, CSRF protections, database-backed rate limiting, role checks, PDO prepared statements, and output escaping.
- A protected administration overview with student, enrolment, subscription, pending-payment, verified-revenue, and course metrics.
- A safe Paystack boundary: server-created pending payments, hosted checkout, server-side verification, HMAC-SHA512 webhook verification, and idempotent webhook intake.
- A Java Lab with corrected floating-point division behavior, starter links from lessons, and 53 Java emulator regression tests.
- A Web Lab whose learner code renders only in a sandboxed opaque-origin iframe.

## Requirements

- PHP 8.3+ with PDO MySQL and cURL.
- MySQL 8.0+.
- Node.js 20+ for Java emulator tests.
- Composer is included for project metadata and PSR-4 configuration; production code has no third-party package dependency.

## Local setup

1. Copy `.env.example` to `.env`; keep `.env` private.
2. Create the MySQL database:

   ```sql
   CREATE DATABASE leons_code CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Set `DB_*` values in `.env`, then run:

   ```powershell
   C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe bin\migrate.php
   C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe bin\seed.php
   ```

4. Create the first administrator with the CLI-only bootstrap:

   ```powershell
   C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe bin\create-admin.php "Leon" admin@example.com
   ```

   Enter the password only when prompted. Never put it in Git, command history, or a public document.

5. Serve the repository through your PHP host. For a local preview:

   ```powershell
   C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe -S 127.0.0.1:8091 -t .
   ```

   Visit `http://127.0.0.1:8091/index.php`.

The seed includes clearly non-production curriculum and one account: `demo.student@leonscode.test` / `DemoStudentOnly-ChangeMe`. Change or remove it before public launch.

## Key project structure

```text
app/                    PHP services: auth, courses, security, PDO, Paystack
assets/                 Leon’s Code page and Web Lab assets
bin/                    migration, seed, and administrator bootstrap commands
database/migrations/    versioned MySQL schema
database/seeds/         demonstration curriculum and plans
views/                  public, student, admin, and legal templates
webhooks/paystack.php   signature-verified, idempotent Paystack endpoint
js/, css/, tests/       preserved Java emulator and its regression tests
index.php               platform entry point
index.html              standalone Leon’s Code Java Lab
web-lab.html            standalone sandboxed Web Lab
```

## Course and content operations

The schema supports courses, modules, lessons, exercises, test cases, quizzes, options, attempts, projects, saved programs, certificates, and settings. The seed supplies Java Foundations, Responsive HTML & CSS, and JavaScript for Interfaces.

The current administration surface provides protected operational metrics. Course authoring screens are the next planned management interface; use migrations/seed data or controlled development tooling until those screens are delivered. Do not expose an administrator registration route.

## Payments and subscriptions

The default state is safe test setup: checkout remains unavailable until `PAYSTACK_SECRET_KEY` is set.

1. Add Paystack **test** keys to `.env`; never expose the secret key to browser JavaScript.
2. Create any recurring plans in Paystack and store their provider plan code in `subscription_plans.paystack_plan_code` through an approved administration workflow.
3. Set the public webhook URL to `/webhooks/paystack.php`.
4. Test checkout, server-side reference verification, a valid webhook, invalid signature, duplicate webhook, failed transaction, and amount/currency mismatch before enabling live keys.
5. Switch to live keys only after the test flow and the legal content are reviewed.

The implementation follows Paystack’s current model: a recurring plan can be provided at transaction initialization and Paystack sends payment/subscription events. Webhook payloads are validated with `x-paystack-signature` HMAC SHA-512 before processing. See Paystack’s official [subscription guide](https://paystack.com/docs/payments/subscriptions/) and [webhook verification guidance](https://paystack.com/docs/payments/webhooks/).

## Tests

```powershell
npm.cmd test
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe tests\php\run.php
Get-ChildItem -Recurse -Filter *.php | ForEach-Object { C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe -l $_.FullName }
```

Actual verification for this build:

- `npm.cmd test`: 53 passed, 0 failed.
- PHP security unit check: passed.
- PHP/JavaScript syntax checks and `git diff --check`: passed.
- MySQL migration and seed: completed against local MySQL 8.4; 3 courses, 9 lessons, and 3 plans created.

## Deployment, backup, and recovery

- Use HTTPS, `APP_ENV=production`, a unique high-entropy `APP_KEY`, and production credentials outside source control.
- Honour the supplied `.htaccess`, or add equivalent host rules. `app`, `bin`, `database`, `docs`, `storage`, and `tests` must not be web-accessible.
- Restrict database credentials to least privileges. Disable PHP error display in production and monitor `storage/logs/app.log` securely.
- Back up database and deployment configuration. For example:

  ```powershell
  C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe -uYOUR_USER -p leons_code > leons_code.sql
  ```

- Test restore in a separate database. Restore the database first, deploy matching code/migrations second, then check routes and payment webhook signatures before reopening enrolment.

## Current limitations and next work

- Email delivery, email verification, and password-reset delivery require an actual mail provider and are not active.
- Complete administrative authoring forms, quiz-taking UI, certificate issuance, saved-program cloud sync, and instructor workflows are represented in the schema but not yet exposed as finished user interfaces.
- Paystack is not live: keys, provider plan codes, public HTTPS webhook delivery, and end-to-end test verification are still required.
- The Java Lab intentionally supports only its documented Java subset.
- Browser visual QA was unavailable in this coding session because no in-app browser tab existed; local HTTP responses, static assets, migrations, seeds, linting, and automated suites were verified instead.
