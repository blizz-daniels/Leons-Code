import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("GitHub Pages workflow publishes the static project root", async () => {
  const [workflow, page] = await Promise.all([
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /path: \./);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(page, /<script type="module" src="js\/app\.js"><\/script>/);
  assert.doesNotMatch(page, /(?:src|href)="\/(?:js|css)\//);
});
