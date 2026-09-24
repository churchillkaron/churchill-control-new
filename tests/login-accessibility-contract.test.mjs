import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/login/page.js", import.meta.url), "utf8");

test("login identity inputs expose stable native names and accessible labels", () => {
  assert.match(source, /id="avantiqo-login-email"/);
  assert.match(source, /name="email"/);
  assert.match(source, /aria-label="Email"/);
  assert.match(source, /id="avantiqo-login-password"/);
  assert.match(source, /name="password"/);
  assert.match(source, /aria-label=\{recoveryMode \? "New password" : "Password"\}/);
  assert.match(source, /id="avantiqo-login-confirm-password"/);
  assert.match(source, /name="confirmPassword"/);
  assert.match(source, /aria-label="Confirm password"/);
});
