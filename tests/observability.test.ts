import test from "node:test";
import assert from "node:assert/strict";
import { classifyTraceSeverity } from "../lib/observability.ts";

test("classifyTraceSeverity marks 5xx as error", () => {
  assert.equal(classifyTraceSeverity(500, 20), "error");
});

test("classifyTraceSeverity marks 4xx as warn", () => {
  assert.equal(classifyTraceSeverity(403, 20), "warn");
});

test("classifyTraceSeverity marks very slow success as warn", () => {
  assert.equal(classifyTraceSeverity(200, 6000), "warn");
});

test("classifyTraceSeverity marks fast success as info", () => {
  assert.equal(classifyTraceSeverity(200, 120), "info");
});
