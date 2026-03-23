import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiValidationError,
  normalizeMessages,
  validateFile
} from "../lib/api-guards.ts";

test("normalizeMessages trims and keeps valid chat roles", () => {
  const normalized = normalizeMessages([
    { role: "user", content: "  hello  " },
    { role: "assistant", content: " world " },
    { role: "invalid", content: "skip" }
  ]);

  assert.deepEqual(normalized, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" }
  ]);
});

test("normalizeMessages rejects empty arrays", () => {
  assert.throws(() => normalizeMessages([]), ApiValidationError);
});

test("validateFile accepts supported pdf uploads", () => {
  const file = new File([Buffer.from("pdf")], "sample.pdf", {
    type: "application/pdf"
  });

  assert.doesNotThrow(() => validateFile(file));
});
