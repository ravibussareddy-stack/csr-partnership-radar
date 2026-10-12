"use client";
/** City / state dropdown built from the place keys present in the data ("state:Maharashtra", "city:Pune"), with counts. */
export function PlaceSelect({ keys, value, onChange, label = "City or state" }: { keys: string[][]; value: string; onChange: (v: string) => void; label?: string }) {
  const counts = new Map<string, number>();
  for (const ks of keys) for (const k of new Set(ks)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const states = [...counts].filter(([k]) => k.startsWith("state:")).sort((a, b) => b[1] - a[1]);
  const cities = [...counts].filter(([k]) => k.startsWith("city:")).sort((a, b) => b[1] - a[1]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="all">All places</option>
      {states.length > 0 && <optgroup label="States">{states.map(([k, n]) => <option key={k} value={k}>{k.slice(6)} ({n})</option>)}</optgroup>}
      {cities.length > 0 && <optgroup label="Cities / districts">{cities.map(([k, n]) => <option key={k} value={k}>{k.slice(5)} ({n})</option>)}</optgroup>}
    </select>
  );
}
