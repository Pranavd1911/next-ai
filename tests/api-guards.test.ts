import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiValidationError,
  normalizeMessages,
  validateFile
} from "../lib/api-guards.ts";
import { mergeRememberedMemory } from "../lib/user-memory.ts";

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

test("mergeRememberedMemory deduplicates and normalizes remembered lines", () => {
  const merged = mergeRememberedMemory(
    "I am a PM student\nI prefer direct answers",
    "  I prefer   direct answers  \nMy goal is to ship fast"
  );

  assert.equal(
    merged,
    "I am a PM student\nI prefer direct answers\nMy goal is to ship fast"
  );
});
