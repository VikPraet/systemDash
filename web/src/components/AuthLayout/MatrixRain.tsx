import { useEffect, useRef } from "react";
import * as S from "./styles";

const WORDS = [
  "ACPI",
  "ALERT",
  "ARP",
  "ASYNC",
  "AUDIT",
  "AUTH",
  "BACKUP",
  "BASH",
  "BEACON",
  "BIND",
  "BIOS",
  "BLOCK",
  "BMC",
  "BRANCH",
  "BRIDGE",
  "BTRFS",
  "BUFFER",
  "BUILD",
  "CACHE",
  "CERT",
  "CGROUP",
  "CHMOD",
  "CHOWN",
  "CHROOT",
  "CLOCK",
  "CLONE",
  "CLUSTER",
  "COMMIT",
  "CORE",
  "CPU",
  "CRON",
  "DAEMON",
  "DEPLOY",
  "DHCP",
  "DIMM",
  "DIRTY",
  "DISK",
  "DNS",
  "DOCKER",
  "ECC",
  "ELF",
  "EPOLL",
  "ETH",
  "EVENT",
  "EXEC",
  "EXT4",
  "FAN",
  "FLUSH",
  "FORK",
  "FSCK",
  "FSYNC",
  "GIT",
  "GPIO",
  "GPU",
  "HASH",
  "HEALTH",
  "HOST",
  "HTTP",
  "HTTPS",
  "ICMP",
  "IMAGE",
  "INIT",
  "INODE",
  "IPMI",
  "IRQ",
  "JOB",
  "JOURNAL",
  "JWT",
  "KERNEL",
  "KEY",
  "KMOD",
  "LATENCY",
  "LAYER",
  "LINK",
  "LOAD",
  "LOGS",
  "LUKS",
  "LVM",
  "MAC",
  "MDADM",
  "MEM",
  "MERGE",
  "METRIC",
  "MIRROR",
  "MOUNT",
  "MQTT",
  "MTU",
  "NAT",
  "NET",
  "NFS",
  "NIC",
  "NODE",
  "NTP",
  "NUMA",
  "NVME",
  "OAUTH",
  "OOM",
  "OVERLAY",
  "PACKET",
  "PAGE",
  "PARITY",
  "PATCH",
  "PCI",
  "PID",
  "PING",
  "POD",
  "POOL",
  "PORT",
  "POWER",
  "PROCESS",
  "PROXY",
  "PSU",
  "PTY",
  "QUEUE",
  "QUOTA",
  "RAID",
  "RAM",
  "REBOOT",
  "REPLICA",
  "ROOT",
  "ROUTE",
  "RSYNC",
  "SALT",
  "SATA",
  "SCSI",
  "SECTOR",
  "SENSOR",
  "SERVICE",
  "SESSION",
  "SFTP",
  "SHELL",
  "SLAB",
  "SLEEP",
  "SMART",
  "SMB",
  "SNAPSHOT",
  "SNMP",
  "SOCKET",
  "SPAWN",
  "SSD",
  "SSH",
  "STATUS",
  "STORAGE",
  "STRIPE",
  "SUDO",
  "SWAP",
  "SYNC",
  "SYSCALL",
  "SYSFS",
  "SYSLOG",
  "SYSTEMD",
  "SYSTEMDASH",
  "TAR",
  "TASK",
  "TCP",
  "TEMP",
  "THERMAL",
  "THREAD",
  "TIMER",
  "TLS",
  "TMPFS",
  "TOKEN",
  "TRACE",
  "TRIM",
  "TTY",
  "UART",
  "UDP",
  "UNIT",
  "UPDATE",
  "UPTIME",
  "USB",
  "VLAN",
  "VOLUME",
  "VOLT",
  "WAKE",
  "WAL",
  "WATTS",
  "WIFI",
  "WORKER",
  "XATTR",
  "XFS",
  "ZFS",
  "ZSTD",
] as const;

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const GLITCH_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";

const IN_MS = 800;
const HOLD_MS = 3400;
const OUT_MS = 800;
const TOTAL_MS = IN_MS + HOLD_MS + OUT_MS;
const COLOR_IN_MS = 1200;
const COLOR_OUT_MS = 1200;
const LETTER_FADE_MS = 280;
const FRAME_MS = 20;
const SPAWN_TRIES = 16;
const ROW_PAD = 2;
const COL_PAD = 2;

const FIELD_RGB = [28, 36, 52] as const;
const HIGHLIGHT_RGB = [79, 140, 255] as const;

type WordFx = {
  word: string;
  rest: string;
  col: number;
  row: number;
  born: number;
};

function parseRgb(
  value: string,
  fallback: readonly [number, number, number]
): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [fallback[0], fallback[1], fallback[2]];
}

function currentPalette() {
  const styles = getComputedStyle(document.documentElement);
  const light = document.documentElement.dataset.theme === "light";
  return {
    light,
    field: parseRgb(styles.getPropertyValue("--border"), FIELD_RGB),
    highlight: parseRgb(styles.getPropertyValue("--accent"), HIGHLIGHT_RGB),
  };
}

function pickGlyph(): string {
  return GLYPHS[(Math.random() * GLYPHS.length) | 0]!;
}

function scrambleLen(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += GLITCH_CHARS[(Math.random() * GLITCH_CHARS.length) | 0]!;
  }
  return out;
}

/** Same scramble-then-reveal as Portfolio-V2 GlitchText, fixed length for the grid. */
function glitchToward(target: string, elapsed: number, duration: number): string {
  const n = target.length;
  if (elapsed >= duration) return target;
  const totalFrames = Math.max(1, Math.floor(duration / FRAME_MS));
  const scrambleFrames = Math.floor(totalFrames * 0.6);
  const revealFrames = Math.max(1, totalFrames - scrambleFrames);
  const frame = Math.floor(elapsed / FRAME_MS);
  if (frame < scrambleFrames) return scrambleLen(n);
  const revealProgress = (frame - scrambleFrames) / revealFrames;
  const charsToReveal = Math.min(n, Math.floor(n * revealProgress));
  let out = "";
  for (let i = 0; i < n; i++) {
    out += i < charsToReveal ? target[i]! : scrambleLen(1);
  }
  return out;
}

/**
 * Full-screen character field. Glyphs drift left-to-right; a few runs
 * glitch into related words, then glitch back.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let cols = 0;
    let rows = 0;
    let cellW = 14;
    let cellH = 18;
    let grid: string[] = [];
    const words: WordFx[] = [];
    let offsetX = 0;
    let lastSpawn = 0;
    let lastFrame = 0;
    let raf = 0;
    let running = true;
    let sizedW = 0;
    let sizedH = 0;

    function locked(col: number, row: number, now: number): WordFx | null {
      for (const w of words) {
        if (now - w.born > TOTAL_MS) continue;
        if (w.row !== row) continue;
        if (col >= w.col && col < w.col + w.word.length) return w;
      }
      return null;
    }

    function rebuild(width: number, height: number) {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "top";
      ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      cellW = Math.max(11, Math.ceil(ctx.measureText("M").width) + 1);
      cellH = 18;
      cols = Math.max(2, Math.ceil(width / cellW) + 2);
      rows = Math.max(1, Math.ceil(height / cellH) + 1);
      grid = Array.from({ length: cols * rows }, pickGlyph);
      words.length = 0;
      offsetX = 0;
      lastSpawn = 0;
      seedWords(performance.now());
    }

    function shiftLeft() {
      const next = new Array<string>(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
          next[r * cols + c] = grid[r * cols + c + 1]!;
        }
        next[r * cols + cols - 1] = pickGlyph();
      }
      grid = next;
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i]!;
        w.col -= 1;
        if (w.col + w.word.length <= 0) words.splice(i, 1);
      }
    }

    function wordCap(): number {
      if (reduceMotion.matches) return 2;
      return Math.max(4, Math.min(8, Math.floor(rows / 5)));
    }

    function pickWord(): string {
      const live = new Set(words.map((w) => w.word));
      const unused = WORDS.filter((w) => !live.has(w));
      const pool = unused.length > 0 ? unused : WORDS;
      return pool[(Math.random() * pool.length) | 0]!;
    }

    function overlaps(col: number, row: number, len: number): boolean {
      for (const w of words) {
        if (Math.abs(w.row - row) < ROW_PAD) {
          const a0 = col - COL_PAD;
          const a1 = col + len + COL_PAD;
          const b0 = w.col;
          const b1 = w.col + w.word.length;
          if (a0 < b1 && b0 < a1) return true;
        }
      }
      return false;
    }

    function spawnWord(now: number): boolean {
      if (words.length >= wordCap()) return false;
      const word = pickWord();
      if (word.length + 2 >= cols) return false;
      const maxCol = cols - word.length - 2;
      if (maxCol < 1) return false;
      for (let i = 0; i < SPAWN_TRIES; i++) {
        const col = 1 + ((Math.random() * maxCol) | 0);
        const row = (Math.random() * rows) | 0;
        if (overlaps(col, row, word.length)) continue;
        words.push({
          word,
          rest: Array.from({ length: word.length }, pickGlyph).join(""),
          col,
          row,
          born: now,
        });
        lastSpawn = now;
        return true;
      }
      lastSpawn = now;
      return false;
    }

    function seedWords(now: number) {
      const n = Math.min(wordCap(), 5);
      for (let i = 0; i < n; i++) spawnWord(now - i * 700);
    }

    function displayFor(fx: WordFx, now: number): string {
      const t = now - fx.born;
      if (t < IN_MS) return glitchToward(fx.word, t, IN_MS);
      if (t < IN_MS + HOLD_MS) return fx.word;
      return glitchToward(fx.rest, t - IN_MS - HOLD_MS, OUT_MS);
    }

    function easeInOut(t: number): number {
      const x = Math.min(1, Math.max(0, t));
      return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
    }

    function envelope(t: number): number {
      if (t < COLOR_IN_MS) return easeInOut(t / COLOR_IN_MS);
      if (t < TOTAL_MS - COLOR_OUT_MS) return 1;
      return 1 - easeInOut((t - (TOTAL_MS - COLOR_OUT_MS)) / COLOR_OUT_MS);
    }

    function letterAmt(fx: WordFx, index: number, now: number): number {
      const t = now - fx.born;
      const n = Math.max(1, fx.word.length);
      const env = envelope(t);
      if (t < IN_MS + HOLD_MS) {
        const lockAt = IN_MS * 0.6 + ((index + 0.5) / n) * IN_MS * 0.4;
        const local = easeInOut((t - lockAt) / LETTER_FADE_MS);
        return env * (0.12 + 0.88 * local);
      }
      const outT = t - IN_MS - HOLD_MS;
      const unlockAt = ((index + 0.5) / n) * OUT_MS * 0.45;
      const local = 1 - easeInOut((outT - unlockAt) / LETTER_FADE_MS);
      return env * (0.12 + 0.88 * local);
    }

    function lerp(a: number, b: number, k: number): number {
      return a + (b - a) * k;
    }

    function frame(now: number) {
      if (!running || !canvas || !ctx) return;
      raf = requestAnimationFrame(frame);
      if (cols === 0 || document.hidden) return;
      if (now - lastFrame < FRAME_MS) return;
      const dt = lastFrame ? Math.min(80, now - lastFrame) : FRAME_MS;
      lastFrame = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (!reduceMotion.matches) {
        offsetX += dt * 0.018;
        while (offsetX >= cellW) {
          offsetX -= cellW;
          shiftLeft();
        }
        for (let n = 0; n < 6; n++) {
          const i = (Math.random() * grid.length) | 0;
          const col = i % cols;
          const row = (i / cols) | 0;
          if (!locked(col, row, now)) grid[i] = pickGlyph();
        }
      }

      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i]!;
        if (now - w.born <= TOTAL_MS) continue;
        for (let c = 0; c < w.word.length; c++) {
          const col = w.col + c;
          if (col >= 0 && col < cols) {
            grid[w.row * cols + col] = w.rest[c] ?? pickGlyph();
          }
        }
        words.splice(i, 1);
      }
      const spawnGap = reduceMotion.matches ? 4200 : 1100;
      if (now - lastSpawn > spawnGap) spawnWord(now);

      ctx.clearRect(0, 0, width, height);
      ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      const palette = currentPalette();
      const pillAlpha = palette.light ? 0.14 : 0.35;

      for (const fx of words) {
        const t = now - fx.born;
        if (t > TOTAL_MS) continue;
        const k = envelope(t);
        const x = fx.col * cellW - offsetX;
        const y = fx.row * cellH;
        const [r, g, b] = palette.highlight;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pillAlpha * k})`;
        ctx.fillRect(x - 3, y - 2, fx.word.length * cellW + 4, cellH);
      }

      for (let row = 0; row < rows; row++) {
        const y = row * cellH;
        if (y > height) continue;
        for (let col = 0; col < cols; col++) {
          const x = col * cellW - offsetX;
          if (x < -cellW || x > width) continue;
          const fx = locked(col, row, now);
          if (fx) {
            const shown = displayFor(fx, now);
            const letter = shown[col - fx.col] ?? pickGlyph();
            const k = letterAmt(fx, col - fx.col, now);
            ctx.fillStyle = `rgb(${lerp(palette.field[0], palette.highlight[0], k)}, ${lerp(palette.field[1], palette.highlight[1], k)}, ${lerp(palette.field[2], palette.highlight[2], k)})`;
            ctx.fillText(letter, x, y);
          } else {
            ctx.fillStyle = `rgb(${palette.field[0]}, ${palette.field[1]}, ${palette.field[2]})`;
            ctx.fillText(grid[row * cols + col]!, x, y);
          }
        }
      }
    }

    function fit() {
      if (!canvas) return;
      const host = canvas.parentElement ?? canvas;
      const { width, height } = host.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      if (Math.abs(width - sizedW) < 1 && Math.abs(height - sizedH) < 1) return;
      sizedW = width;
      sizedH = height;
      rebuild(width, height);
    }

    const host = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    window.addEventListener("resize", fit);
    fit();
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return <S.AuthMatrix ref={canvasRef} aria-hidden="true" />;
}
