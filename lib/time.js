// endsAt is a timestamp in ms, or null for a block with no time limit.
export function formatRemaining(endsAt) {
  if (endsAt == null) return "No limit";
  const total = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
