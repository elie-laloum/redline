import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { invocation } from "../../src/domain/invocation.ts";

describe("les commandes que redline suggere", () => {
  it("nomment redline une fois installe, et bun redline depuis un clone", () => {
    assert.equal(invocation({}), "redline");
    assert.equal(invocation({ npm_lifecycle_event: "redline" }), "bun redline");
    assert.equal(invocation({ npm_lifecycle_event: "test" }), "redline");
  });
});
