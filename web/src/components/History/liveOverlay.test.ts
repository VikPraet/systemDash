import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  _resetLiveBufferForTests,
  overlayLiveHistory,
  pushLiveSnapshot,
  liveSnapshots,
} from "./liveOverlay";
import type { HistorySeries, SystemSnapshot } from "../../types";

afterEach(() => _resetLiveBufferForTests());

describe("overlayLiveHistory", () => {
  it("appends SSE snapshots after the last recorded point", () => {
    const recorded = series([1000, 6000], [10, 20]);
    const live = [snap(7000, 35), snap(8000, 40)];
    const out = overlayLiveHistory(recorded, live, 60_000, 8000);
    assert.deepEqual(out?.t, [1000, 6000, 7000, 8000]);
    assert.deepEqual(out?.cpuLoad, [10, 20, 35, 40]);
    assert.equal(out?.bucketMs, 1000);
  });

  it("does not duplicate a live point that is already in the recording", () => {
    const recorded = series([1000, 6000], [10, 20]);
    const live = [snap(6000, 20), snap(6100, 21)];
    const out = overlayLiveHistory(recorded, live, 60_000, 6100);
    assert.deepEqual(out?.t, [1000, 6000]);
  });

  it("can draw a live chart with no recorded history", () => {
    const out = overlayLiveHistory(null, [snap(1000, 12), snap(2000, 18)], 60_000, 2000);
    assert.deepEqual(out?.t, [1000, 2000]);
    assert.deepEqual(out?.cpuLoad, [12, 18]);
  });
});

describe("pushLiveSnapshot", () => {
  it("replaces bursts within 400ms instead of stacking them", () => {
    pushLiveSnapshot(snap(1000, 1));
    pushLiveSnapshot(snap(1200, 2));
    pushLiveSnapshot(snap(2000, 3));
    const out = overlayLiveHistory(null, liveSnapshots(), 60_000, 2000);
    assert.deepEqual(out?.t, [1200, 2000]);
    assert.deepEqual(out?.cpuLoad, [2, 3]);
  });
});

function series(t: number[], cpuLoad: number[]): HistorySeries {
  const n = t.length;
  const nil = () => new Array<number | null>(n).fill(null);
  return {
    from: t[0] ?? 0,
    to: t[t.length - 1] ?? 0,
    bucketMs: 5000,
    t,
    cpuLoad,
    cpuTemp: nil(),
    cpuClock: nil(),
    memUsedPct: nil(),
    swapUsedPct: nil(),
    procCount: nil(),
    procRunning: nil(),
    memTotalBytes: 8,
    cpuCores: [],
    gpus: [],
  };
}

function snap(timestamp: number, loadPercent: number): SystemSnapshot {
  return {
    timestamp,
    app: { name: "Beacon", version: "test" },
    host: {
      hostname: "t",
      platform: "test",
      distro: "",
      release: "",
      arch: "x64",
      kernel: "",
      uptimeSeconds: 1,
      systemManufacturer: "",
      systemModel: "",
    },
    cpu: {
      manufacturer: "",
      brand: "",
      physicalCores: 1,
      cores: 1,
      baseSpeedGHz: 1,
      maxSpeedGHz: 1,
      currentSpeedGHz: 1,
      minSpeedGHz: 1,
      loadPercent,
      perCoreLoad: [loadPercent],
      perCoreSpeed: [1],
      temperatureC: null,
    },
    memory: {
      totalBytes: 8,
      usedBytes: 1,
      freeBytes: 7,
      activeBytes: 1,
      availableBytes: 7,
      usedPercent: 10,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    },
    disks: [],
    gpus: [],
  };
}
