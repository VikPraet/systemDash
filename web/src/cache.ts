import type { DirListing, FsRoot, ProcessList } from "./types";

// Folder sizes are computed lazily in the background after a listing loads.
export type DirSize =
  | { state: "loading" }
  | { state: "done"; bytes: number; partial: boolean }
  | { state: "error" };

interface FilesCache {
  roots: FsRoot[];
  path: string | null;
  listing: DirListing | null;
  dirSizes: Record<string, DirSize>;
  // Which listing the cached sizes belong to, so we don't recompute on remount.
  dirSizesPath: string | null;
}

interface AppCache {
  processes: ProcessList | null;
  files: FilesCache;
}

// Module-level cache that survives tab unmount/remount. Tabs seed their initial
// state from here so switching back shows the last data instantly while a fresh
// fetch happens in the background, instead of flashing a loading screen.
export const cache: AppCache = {
  processes: null,
  files: {
    roots: [],
    path: null,
    listing: null,
    dirSizes: {},
    dirSizesPath: null,
  },
};
