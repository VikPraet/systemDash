export type PreviewKind = "image" | "video" | "audio" | "pdf" | "binary" | "text";

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "jfif",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "apng",
]);

const VIDEO_EXT = new Set([
  "mp4",
  "webm",
  "mkv",
  "mov",
  "avi",
  "m4v",
  "ogv",
  "wmv",
]);

const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "opus",
  "oga",
  "wma",
]);

const BINARY_EXT = new Set([
  "zip",
  "rar",
  "7z",
  "gz",
  "tgz",
  "tar",
  "xz",
  "bz2",
  "iso",
  "exe",
  "dll",
  "msi",
  "so",
  "dylib",
  "dmg",
  "bin",
  "wasm",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "db",
  "sqlite",
  "sqlite3",
  "vmdk",
  "vhd",
  "vhdx",
  "img",
  "apk",
  "deb",
  "rpm",
  "jar",
  "class",
  "pyc",
  "pyo",
  "o",
  "obj",
  "lib",
  "a",
  "node",
  "psd",
  "ai",
  "sketch",
  "fig",
  "docx",
  "xlsx",
  "pptx",
  "odt",
  "ods",
  "odp",
  "doc",
  "xls",
  "ppt",
  "pages",
  "numbers",
  "key",
]);

export function fileExtension(name: string, ext?: string | null): string {
  if (ext && ext.trim()) return ext.replace(/^\./, "").toLowerCase();
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function previewKind(name: string, ext?: string | null): PreviewKind {
  const resolved = fileExtension(name, ext);
  if (resolved === "pdf") return "pdf";
  if (IMAGE_EXT.has(resolved)) return "image";
  if (VIDEO_EXT.has(resolved)) return "video";
  if (AUDIO_EXT.has(resolved)) return "audio";
  if (BINARY_EXT.has(resolved)) return "binary";
  return "text";
}

export function isSvgFile(name: string, ext?: string | null): boolean {
  return fileExtension(name, ext) === "svg";
}

/** Files the text editor can usefully open. SVG is XML, so it stays editable. */
export function isTextEditable(name: string, ext?: string | null): boolean {
  const kind = previewKind(name, ext);
  return kind === "text" || isSvgFile(name, ext);
}

export function kindLabel(kind: PreviewKind): string {
  switch (kind) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "pdf":
      return "PDF";
    case "binary":
      return "File";
    default:
      return "Text";
  }
}

export function isBinaryReadError(message: string): boolean {
  return /binary/i.test(message);
}
