// localStorage keys, and the one-time migration off the old ones.
//
// The app's saved state was split across two prefixes — `sbl-` for the product
// (`sbl-seen`, `sbl-theme`) and `jarvis-` / `gyro-` for whatever was branded
// that week. Renaming the assistant to Hephaestus was the moment to settle on
// one prefix, but a rename without a migration silently resets returning
// visitors: the dismissed onboarding coach comes back, the room choice is
// forgotten, and a day's assistant quota is handed out again. So every renamed
// key carries its old name here, and the first load after the rename copies the
// value across (and clears the old one, so this only ever happens once).
const RENAMES = [
  ['jarvis-coached', 'sbl-coached'],          // the first-run coach, retired
  ['jarvis-room-mode', 'sbl-room-mode'],      // modeled ⇄ scan bench
  ['gyro-jarvis-usage', 'sbl-hephaestus-usage'], // assistant's free-tier day counter
];

export function migrateStorageKeys() {
  for (const [from, to] of RENAMES) {
    try {
      const old = localStorage.getItem(from);
      if (old === null) continue;
      if (localStorage.getItem(to) === null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    } catch { /* private mode / storage disabled — nothing to migrate */ }
  }
}
