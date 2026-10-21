import test from "node:test";
import assert from "node:assert/strict";
import { JavaScanner } from "../js/runtime/java-io.js";

test("Scanner preserves Java token and line behavior across queued input", async () => {
  const chunks = ["Ada Lovelace\n17 true"];
  const scanner = new JavaScanner(async () => chunks.length ? chunks.shift() : null);
  assert.equal(await scanner.next(), "Ada");
  assert.equal(await scanner.nextLine(), " Lovelace");
  assert.equal(await scanner.nextInt(), 17);
  assert.equal(await scanner.nextBoolean(), true);
});

test("Scanner reports Java-like input mismatches", async () => {
  const scanner = new JavaScanner(async () => "not-a-number");
  await assert.rejects(scanner.nextInt(), /InputMismatchException/);
});
