import test from "node:test";
import assert from "node:assert/strict";
import { safeJsonParse } from "../js/utils/helpers.js";

test("safe JSON parsing falls back for missing, null, and malformed browser values", () => {
  const fallback = { restoreSession: true };
  assert.equal(safeJsonParse(null, fallback), fallback);
  assert.equal(safeJsonParse("", fallback), fallback);
  assert.equal(safeJsonParse("null", fallback), fallback);
  assert.equal(safeJsonParse("not JSON", fallback), fallback);
  assert.deepEqual(safeJsonParse('{"restoreSession":false}', fallback), { restoreSession: false });
});
