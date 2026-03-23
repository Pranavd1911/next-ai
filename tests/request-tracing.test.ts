import test from "node:test";
import assert from "node:assert/strict";
import {
  startRequestTrace,
  traceHeaders
} from "../lib/request-tracing.ts";

test("startRequestTrace creates a request id and route", () => {
  const trace = startRequestTrace("api/chat");

  assert.equal(trace.route, "api/chat");
  assert.equal(typeof trace.requestId, "string");
  assert.equal(trace.requestId.length > 10, true);
});

test("traceHeaders attaches request id header", () => {
  const trace = startRequestTrace("api/upload");
  const headers = traceHeaders(trace);

  assert.equal(headers.get("X-Request-Id"), trace.requestId);
});
