/**
 * Turning the text a page shows ("12.3K", "1,204", "2.1M") into a
 * number, so we never rely on the AI's arithmetic. Returns null for
 * anything that isn't clearly a count.
 */
export function parseCount(text: string | null | undefined): { value: number | null; abbreviated: boolean } {
  if (!text) return { value: null, abbreviated: false };
  const t = text.replace(/ | /g, " ").trim();
  const m = t.match(/(\d[\d.,\s]*)\s*([KkMmBb]|thousand|million|billion|mil|mln|bn)?(?![a-z])/i);
  if (!m) return { value: null, abbreviated: false };
  let digits = m[1].trim();
  const suffix = (m[2] ?? "").toLowerCase();
  const mult =
    suffix === "k" || suffix === "thousand" ? 1e3 : suffix === "m" || suffix === "million" || suffix === "mil" || suffix === "mln" ? 1e6 : suffix === "b" || suffix === "billion" || suffix === "bn" ? 1e9 : 1;

  if (mult > 1) {
    // "12.3K", "12,3K" (comma as decimal point), "1.2M"
    const n = Number(digits.replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, ""));
    if (!Number.isFinite(n)) return { value: null, abbreviated: true };
    return { value: Math.round(n * mult), abbreviated: true };
  }

  // Whole numbers: "1,204", "1.204", "1 204" are thousands separators.
  digits = digits.replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) return { value: Number(digits.replace(/[.,]/g, "")), abbreviated: false };
  if (/^\d+$/.test(digits)) return { value: Number(digits), abbreviated: false };
  return { value: null, abbreviated: false };
}
