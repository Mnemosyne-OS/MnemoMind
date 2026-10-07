/**
 * eta — how long a run still needs, from what was measured (copied from MnemoLaw).
 *
 * The rate is MEASURED on this run (entries done / seconds elapsed), never
 * assumed: one entry is a page read plus a few vault writes, and both vary by
 * machine and by page. Two floors before any estimate is printed (MIN_DONE
 * entries AND MIN_SECONDS seconds), because the first entries pay the
 * embedder warm-up. Below that the screen shows the elapsed clock only.
 */

/** Entries done before any estimate is shown. */
export const MIN_DONE = 5;
/** Seconds elapsed before any estimate is shown. */
export const MIN_SECONDS = 10;

/** Seconds left, or null while the rate is not measured yet (or nothing is left to do). */
export function remainingSeconds(done: number, total: number, elapsedSeconds: number): number | null {
  if (!(done >= MIN_DONE) || !(elapsedSeconds >= MIN_SECONDS)) return null;
  if (!(total > done)) return null;
  const rate = done / elapsedSeconds;
  return Math.round((total - done) / rate);
}

/** "45 s", "3 min", "1 h 05" — rounded to the NEAREST unit, never floored (doc 112 §7: a floored clock reads as stuck). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
