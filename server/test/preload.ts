import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-test-"));
process.env.SYSTEMDASH_DATA_DIR = dir;
process.env.SYSTEMDASH_LISTEN = "0";
process.env.SYSTEMDASH_AUTH_DELAY_AFTER = "100";
process.env.SYSTEMDASH_AUTH_LOCKOUT_AFTER = "5";
process.env.SYSTEMDASH_AUTH_WINDOW_MS = "60000";
process.env.SYSTEMDASH_AUTH_DELAY_MS = "0";
