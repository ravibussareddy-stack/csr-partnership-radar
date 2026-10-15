// Site-wide display settings the team changed through dashboard feedback (lib/display.ts).
// Renders nothing at the defaults; otherwise one CSS rule that scales every rem-based size.
import { getDisplaySettings } from "@/lib/data";

export async function DisplaySettings() {
  const d = await getDisplaySettings();
  if (d.fontScale === 1) return null;
  return <style>{`html { font-size: ${Math.round(d.fontScale * 100)}%; }`}</style>;
}
