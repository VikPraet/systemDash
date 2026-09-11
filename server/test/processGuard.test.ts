import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  handleUnexpected,
  installProcessGuards,
  uninstallProcessGuards,
  type UnexpectedKind,
} from "../src/processGuard.js";

describe("process guards", () => {
  afterEach(() => uninstallProcessGuards());

  it("installs process listeners once", () => {
    const beforeR = process.listenerCount("unhandledRejection");
    const beforeE = process.listenerCount("uncaughtException");
    installProcessGuards();
    installProcessGuards();
    assert.equal(process.listenerCount("unhandledRejection"), beforeR + 1);
    assert.equal(process.listenerCount("uncaughtException"), beforeE + 1);
  });

  it("reports unexpected errors without throwing", () => {
    const seen: Array<{ kind: UnexpectedKind; err: unknown }> = [];
    installProcessGuards((kind, err) => seen.push({ kind, err }));
    handleUnexpected("unhandledRejection", new Error("hook exploded"));
    handleUnexpected("uncaughtException", new Error("systemd unit vanished"));
    assert.equal(seen.length, 2);
    assert.equal(seen[0].kind, "unhandledRejection");
    assert.equal((seen[0].err as Error).message, "hook exploded");
    assert.equal(seen[1].kind, "uncaughtException");
  });
});
