import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePhasedDeferred } from "../src/updates.js";

const phasedLog = `Reading package lists...
Building dependency tree...
Reading state information...
Calculating upgrade...
The following upgrades have been deferred due to phasing:
  dmidecode libaudit-common libaudit1
0 upgraded, 0 newly installed, 0 to remove and 3 not upgraded.
`;

test("parsePhasedDeferred reads the packages apt will skip", () => {
  assert.deepEqual(parsePhasedDeferred(phasedLog), [
    "dmidecode",
    "libaudit-common",
    "libaudit1",
  ]);
});

test("parsePhasedDeferred keeps wrapped package lines and drops the next section", () => {
  const output = `The following upgrades have been deferred due to phasing:
  dmidecode libaudit-common
  libaudit1:amd64
The following packages have been kept back:
  linux-image
0 upgraded, 0 newly installed, 0 to remove and 4 not upgraded.
`;
  assert.deepEqual(parsePhasedDeferred(output), [
    "dmidecode",
    "libaudit-common",
    "libaudit1",
  ]);
});

test("parsePhasedDeferred ignores kept-back packages and empty output", () => {
  assert.deepEqual(
    parsePhasedDeferred("The following packages have been kept back:\n  linux-image\n"),
    []
  );
  assert.deepEqual(parsePhasedDeferred(""), []);
});
