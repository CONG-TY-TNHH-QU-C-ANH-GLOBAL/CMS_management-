// Turn what an operator pastes into a Hub product id. They copy whichever is at
// hand — the bare id, or the catalog link from the website or the Hub — so both
// are accepted rather than making them dig the id out by hand.

const HUB_ID = /^[a-z0-9]{20,40}$/i;

/** Hub product id from a bare id or any URL carrying `productId=`; null if neither. */
export function parseProductId(input: string): string | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (HUB_ID.test(raw)) return raw;
  try {
    const id = new URL(raw).searchParams.get("productId")?.trim() ?? "";
    return HUB_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
