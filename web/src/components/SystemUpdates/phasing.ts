const APT_PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]*$/;

/** Package names apt printed under "deferred due to phasing". Mirrors the server parser. */
export function parsePhasedDeferred(output: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let capturing = false;

  const add = (raw: string) => {
    for (const token of raw.trim().split(/\s+/)) {
      if (!token) continue;
      const name = token.split(":")[0] ?? token;
      if (!APT_PACKAGE_NAME.test(name) || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  };

  for (const line of output.split(/\r?\n/)) {
    const header = /deferred due to phasing:?\s*(.*)$/i.exec(line);
    if (header) {
      capturing = true;
      if (header[1]) add(header[1]);
      continue;
    }
    if (!capturing) continue;
    if (/^\s+\S/.test(line)) {
      add(line);
      continue;
    }
    capturing = false;
  }

  return names;
}
