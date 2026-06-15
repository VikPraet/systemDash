import type {
  DirListing,
  FsRoot,
  HistorySeries,
  HistoryStats,
  ProcessList,
  Settings,
  SystemSnapshot,
} from "./types";
import { DEFAULT_SETTINGS } from "./api";

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

interface HistoryCache {
  // The chart range/data the user last viewed, so switching back to the History
  // tab paints instantly instead of flashing an empty state while refetching.
  rangeId: string;
  data: HistorySeries | null;
  stats: HistoryStats | null;
}

interface AppCache {
  processes: ProcessList | null;
  snapshot: SystemSnapshot | null;
  files: FilesCache;
  history: HistoryCache;
  settings: Settings;
}

// Module-level cache that survives tab unmount/remount. Tabs seed their initial
// state from here so switching back shows the last data instantly while a fresh
// fetch happens in the background, instead of flashing a loading screen.
export const cache: AppCache = {
  processes: null,
  snapshot: null,
  files: {
    roots: [],
    path: null,
    listing: null,
    dirSizes: {},
    dirSizesPath: null,
  },
  history: {
    rangeId: "live",
    data: null,
    stats: null,
  },
  settings: DEFAULT_SETTINGS,
};
