type Closer = () => void;

const bySession = new Map<string, Set<Closer>>();
const byUser = new Map<number, Set<Closer>>();

export function registerLiveSocket(
  sessionHash: string,
  userId: number,
  close: Closer
): () => void {
  let s = bySession.get(sessionHash);
  if (!s) {
    s = new Set();
    bySession.set(sessionHash, s);
  }
  s.add(close);
  let u = byUser.get(userId);
  if (!u) {
    u = new Set();
    byUser.set(userId, u);
  }
  u.add(close);
  return () => {
    s!.delete(close);
    if (s!.size === 0) bySession.delete(sessionHash);
    u!.delete(close);
    if (u!.size === 0) byUser.delete(userId);
  };
}

function runAll(set: Set<Closer> | undefined): void {
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}

export function disconnectSession(sessionHash: string): void {
  runAll(bySession.get(sessionHash));
}

export function disconnectUser(userId: number): void {
  runAll(byUser.get(userId));
}
