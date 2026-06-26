/** IDs for client-side state (terminal tabs, etc.). */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // `randomUUID` is only available in secure contexts (HTTPS / localhost).
  // Fall back for plain HTTP on a LAN IP.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
