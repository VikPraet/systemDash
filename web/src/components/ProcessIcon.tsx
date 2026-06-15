import type { ReactElement } from "react";

// We can't reliably extract real executable icons across Windows/Linux/macOS
// without heavy, platform-specific work, so instead we recognise common process
// names and draw a matching line-icon. Anything unknown falls back to a generic
// "app" (has a window) or "background process" glyph.
type Category =
  | "browser"
  | "code"
  | "terminal"
  | "chat"
  | "media"
  | "game"
  | "document"
  | "shield"
  | "system"
  | "files"
  | "app"
  | "process";

const LABELS: Record<Category, string> = {
  browser: "Web browser",
  code: "Developer tool",
  terminal: "Terminal / shell",
  chat: "Communication",
  media: "Media",
  game: "Game",
  document: "Document / office",
  shield: "Security",
  system: "System process",
  files: "File explorer",
  app: "Application",
  process: "Background process",
};

const ICONS: Record<Category, ReactElement> = {
  browser: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
    </>
  ),
  code: (
    <>
      <path d="M8.5 8 4.5 12l4 4" />
      <path d="M15.5 8 19.5 12l-4 4" />
      <path d="M13.5 6.5 10.5 17.5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </>
  ),
  chat: (
    <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  ),
  media: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5 16 12l-6 3.5z" />
    </>
  ),
  game: (
    <>
      <rect x="2" y="8" width="20" height="9" rx="4.5" />
      <path d="M7 12.5h3M8.5 11v3" />
      <path d="M15.5 12h.01M18 12h.01M16.75 10.75h.01M16.75 13.25h.01" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 16.5h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  system: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </>
  ),
  files: (
    <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  app: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M6.5 6.5h.01M9 6.5h.01" />
    </>
  ),
  process: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 2v2M14 2v2M10 20v2M14 20v2M2 10h2M2 14h2M20 10h2M20 14h2" />
    </>
  ),
};

const EXACT: Record<string, Category> = {};
function add(category: Category, ...names: string[]): void {
  for (const n of names) EXACT[n] = category;
}

add(
  "browser",
  "chrome", "msedge", "edge", "firefox", "firefox-bin", "opera", "opera_gx",
  "brave", "vivaldi", "safari", "iexplore", "chromium", "chromium-browser",
  "thorium", "librewolf", "waterfox", "tor", "arc"
);
add(
  "code",
  "code", "code - insiders", "cursor", "devenv", "idea64", "idea", "pycharm64",
  "pycharm", "webstorm64", "webstorm", "clion64", "rider64", "goland64",
  "phpstorm64", "studio64", "sublime_text", "atom", "fleet", "eclipse",
  "netbeans", "node", "deno", "bun", "python", "python3", "pythonw", "py",
  "java", "javaw", "ruby", "perl", "php", "dotnet", "dart", "rustc", "cargo",
  "tsc", "ts-node", "npm", "yarn", "pnpm", "gradle", "mvn"
);
add(
  "terminal",
  "powershell", "pwsh", "cmd", "conhost", "openconsole", "windowsterminal",
  "wt", "bash", "sh", "zsh", "fish", "alacritty", "kitty", "wezterm-gui",
  "wezterm", "mintty", "gnome-terminal", "konsole", "tmux"
);
add(
  "chat",
  "discord", "discordptb", "discordcanary", "slack", "teams", "ms-teams",
  "msteams", "zoom", "telegram", "whatsapp", "skype", "signal", "element",
  "thunderbird", "mailbird", "franz", "webex"
);
add(
  "media",
  "spotify", "vlc", "wmplayer", "mpv", "foobar2000", "itunes", "audacity",
  "obs64", "obs32", "obs", "mpc-hc64", "mpc-hc", "groove", "music", "aimp",
  "winamp", "clementine", "rhythmbox", "deezer", "tidal"
);
add(
  "game",
  "steam", "steamwebhelper", "steamservice", "epicgameslauncher",
  "unrealcefsubprocess", "origin", "eadesktop", "galaxyclient", "goggalaxy",
  "battle.net", "battlenet", "riotclientservices", "leagueclientux",
  "leagueclient", "gameoverlayui", "ubisoftconnect", "uplay"
);
add(
  "document",
  "winword", "excel", "powerpnt", "onenote", "outlook", "msaccess", "mspub",
  "visio", "acrobat", "acrord32", "foxitpdfreader", "sumatrapdf", "notepad",
  "wordpad", "libreoffice", "soffice", "wps", "et", "wpp"
);
add(
  "shield",
  "msmpeng", "nissrv", "securityhealthservice", "securityhealthsystray",
  "mpdefendercoreservice", "smartscreen", "avp", "avgui", "avastui",
  "avastsvc", "mbam", "mbamservice", "msseces", "windefend", "bdagent",
  "ekrn", "egui"
);
add("files", "explorer");
add(
  "system",
  "system", "registry", "smss", "csrss", "wininit", "winlogon", "services",
  "lsass", "lsaiso", "svchost", "dwm", "fontdrvhost", "spoolsv", "taskhostw",
  "sihost", "ctfmon", "runtimebroker", "dllhost", "wmiprvse", "searchindexer",
  "searchhost", "searchapp", "searchui", "startmenuexperiencehost",
  "shellexperiencehost", "textinputhost", "applicationframehost", "audiodg",
  "wuauclt", "usocoreworker", "memcompression", "memorycompression", "taskmgr",
  "mmc", "rundll32", "backgroundtaskhost", "systemsettings", "lockapp",
  "useroobebroker", "systemd", "init", "kthreadd", "systemd-journald",
  "systemd-logind", "dbus-daemon", "networkmanager", "cron", "crond",
  "rsyslogd", "udevd", "polkitd", "gnome-shell", "xorg", "pipewire",
  "pulseaudio", "sshd", "upowerd", "accounts-daemon"
);

// Prefix rules catch the many helper/child processes that share a base name
// (e.g. "chrome", "Google Chrome Helper", "svchost", "kworker/0:1").
const PREFIX: [string, Category][] = [
  ["chrome", "browser"],
  ["google chrome", "browser"],
  ["firefox", "browser"],
  ["msedge", "browser"],
  ["microsoft edge", "browser"],
  ["opera", "browser"],
  ["brave", "browser"],
  ["code", "code"],
  ["python", "code"],
  ["java", "code"],
  ["node", "code"],
  ["discord", "chat"],
  ["teams", "chat"],
  ["steam", "game"],
  ["spotify", "media"],
  ["svchost", "system"],
  ["kworker", "system"],
  ["ksoftirqd", "system"],
  ["systemd", "system"],
  ["runtimebroker", "system"],
];

function categorize(name: string, hasWindow: boolean): Category {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\.(exe|bin|app)$/i, "");
  if (key in EXACT) return EXACT[key];
  for (const [prefix, category] of PREFIX) {
    if (key.startsWith(prefix)) return category;
  }
  return hasWindow ? "app" : "process";
}

export function ProcessIcon({
  name,
  hasWindow,
}: {
  name: string;
  hasWindow: boolean;
}) {
  const category = categorize(name, hasWindow);
  return (
    <svg
      className={`proc-icon pi-${category}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label={LABELS[category]}
    >
      <title>{LABELS[category]}</title>
      {ICONS[category]}
    </svg>
  );
}
