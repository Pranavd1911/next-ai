import test from "node:test";
import assert from "node:assert/strict";
import {
  hasSufficientEmbeddedText,
  mergeExtractedTextSegments,
  shouldStopEarlyDuringOcr
} from "../lib/upload-utils.ts";

test("hasSufficientEmbeddedText enforces minimum threshold", () => {
  assert.equal(hasSufficientEmbeddedText("short text"), false);
  assert.equal(hasSufficientEmbeddedText("a".repeat(140)), true);
});

test("mergeExtractedTextSegments joins non-empty chunks cleanly", () => {
  assert.equal(
    mergeExtractedTextSegments("first page", "second page"),
    "first page\n\nsecond page"
  );
});

test("shouldStopEarlyDuringOcr returns true for long enough text", () => {
  assert.equal(shouldStopEarlyDuringOcr("a".repeat(699)), false);
  assert.equal(shouldStopEarlyDuringOcr("a".repeat(700)), true);
});
