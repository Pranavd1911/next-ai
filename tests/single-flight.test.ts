import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireSingleFlight,
  releaseSingleFlight
} from "../lib/single-flight.ts";

test("single flight blocks duplicate keys until released", () => {
  const keys = new Set<string>();

  assert.equal(acquireSingleFlight(keys, "chat"), true);
  assert.equal(acquireSingleFlight(keys, "chat"), false);

  releaseSingleFlight(keys, "chat");

  assert.equal(acquireSingleFlight(keys, "chat"), true);
});
