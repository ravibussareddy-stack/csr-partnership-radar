/**
 * Normalises free-text geographies from the classifier ("Pune", "Pimpri-Chinchwad", "MH", "Bengaluru")
 * into a state and, where known, a city, for the city / state filter.
 */
export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh", "Andaman and Nicobar Islands", "Lakshadweep", "Dadra and Nagar Haveli and Daman and Diu",
];

const STATE_ALIASES: Record<string, string> = {
  mh: "Maharashtra", up: "Uttar Pradesh", mp: "Madhya Pradesh", tn: "Tamil Nadu", ap: "Andhra Pradesh", wb: "West Bengal",
  orissa: "Odisha", "new delhi": "Delhi", ncr: "Delhi", "delhi ncr": "Delhi", "j&k": "Jammu and Kashmir", pondicherry: "Puducherry",
};

const CITIES: Record<string, [string, string]> = {
  pune: ["Pune", "Maharashtra"], "pimpri-chinchwad": ["Pune", "Maharashtra"], "pimpri chinchwad": ["Pune", "Maharashtra"], chakan: ["Pune", "Maharashtra"],
  hinjewadi: ["Pune", "Maharashtra"], talegaon: ["Pune", "Maharashtra"], baramati: ["Pune", "Maharashtra"], ranjangaon: ["Pune", "Maharashtra"],
  mumbai: ["Mumbai", "Maharashtra"], thane: ["Thane", "Maharashtra"], "navi mumbai": ["Navi Mumbai", "Maharashtra"], nagpur: ["Nagpur", "Maharashtra"],
  nashik: ["Nashik", "Maharashtra"], aurangabad: ["Chhatrapati Sambhajinagar", "Maharashtra"], "chhatrapati sambhajinagar": ["Chhatrapati Sambhajinagar", "Maharashtra"],
  kolhapur: ["Kolhapur", "Maharashtra"], solapur: ["Solapur", "Maharashtra"], satara: ["Satara", "Maharashtra"], palghar: ["Palghar", "Maharashtra"],
  raigad: ["Raigad", "Maharashtra"], ratnagiri: ["Ratnagiri", "Maharashtra"], amravati: ["Amravati", "Maharashtra"], gadchiroli: ["Gadchiroli", "Maharashtra"],
  ahmednagar: ["Ahilyanagar", "Maharashtra"], ahilyanagar: ["Ahilyanagar", "Maharashtra"], latur: ["Latur", "Maharashtra"], nanded: ["Nanded", "Maharashtra"],
  bengaluru: ["Bengaluru", "Karnataka"], bangalore: ["Bengaluru", "Karnataka"], mysuru: ["Mysuru", "Karnataka"], mysore: ["Mysuru", "Karnataka"],
  hyderabad: ["Hyderabad", "Telangana"], chennai: ["Chennai", "Tamil Nadu"], coimbatore: ["Coimbatore", "Tamil Nadu"], kolkata: ["Kolkata", "West Bengal"],
  ahmedabad: ["Ahmedabad", "Gujarat"], surat: ["Surat", "Gujarat"], vadodara: ["Vadodara", "Gujarat"], jaipur: ["Jaipur", "Rajasthan"],
  lucknow: ["Lucknow", "Uttar Pradesh"], noida: ["Noida", "Uttar Pradesh"], gurugram: ["Gurugram", "Haryana"], gurgaon: ["Gurugram", "Haryana"],
  bhopal: ["Bhopal", "Madhya Pradesh"], indore: ["Indore", "Madhya Pradesh"], bhubaneswar: ["Bhubaneswar", "Odisha"], patna: ["Patna", "Bihar"],
  ranchi: ["Ranchi", "Jharkhand"], kochi: ["Kochi", "Kerala"], thiruvananthapuram: ["Thiruvananthapuram", "Kerala"], visakhapatnam: ["Visakhapatnam", "Andhra Pradesh"],
  goa: ["Goa", "Goa"], panaji: ["Panaji", "Goa"], chandigarh: ["Chandigarh", "Chandigarh"], dehradun: ["Dehradun", "Uttarakhand"], guwahati: ["Guwahati", "Assam"],
};

const STATE_BY_KEY = new Map(STATES.map((s) => [s.toLowerCase(), s]));

export interface Place {
  city: string | null;
  state: string | null; // null for "India" / unknown
}

export function normalisePlace(raw: string): Place | null {
  const k = raw.toLowerCase().replace(/\b(district|city|state|region|rural|urban)\b/g, "").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!k || k === "india" || k === "pan india" || k === "pan-india" || k === "national") return null;
  if (CITIES[k]) return { city: CITIES[k][0], state: CITIES[k][1] };
  if (STATE_BY_KEY.has(k)) return { city: null, state: STATE_BY_KEY.get(k)! };
  if (STATE_ALIASES[k]) return { city: null, state: STATE_ALIASES[k] };
  // "Pune, Maharashtra" / "rural Maharashtra"
  for (const part of k.split(/\s*[,/]\s*|\s+and\s+/)) {
    if (CITIES[part]) return { city: CITIES[part][0], state: CITIES[part][1] };
  }
  for (const [key, state] of STATE_BY_KEY) if (k.includes(key)) return { city: null, state };
  return { city: raw.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40), state: null };
}

/** Filter keys for an item: "state:Maharashtra", "city:Pune". */
export function placeKeys(geographies: string[]): string[] {
  const out = new Set<string>();
  for (const g of geographies) {
    const p = normalisePlace(g);
    if (!p) continue;
    if (p.state) out.add(`state:${p.state}`);
    if (p.city) out.add(`city:${p.city}`);
  }
  return [...out];
}

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Place keys for a company from where it actually spends CSR (National CSR Portal top states and
 * districts). Used where the item itself has no location (contacts, announcement cycles).
 */
export function companyPlaceKeys(topStates: { state: string; amount: number }[] = [], topDistricts: { district: string; state: string; amount: number }[] = []): string[] {
  const out = new Set<string>();
  for (const s of topStates.filter((x) => x.amount > 0).slice(0, 4)) {
    const p = normalisePlace(s.state);
    if (p?.state) out.add(`state:${p.state}`);
  }
  for (const d of topDistricts.filter((x) => x.amount > 0 && !/pan india|not mentioned/i.test(x.district)).slice(0, 6)) {
    const p = normalisePlace(d.district);
    out.add(`city:${p?.city ?? title(d.district)}`);
    const st = normalisePlace(d.state)?.state;
    if (st) out.add(`state:${st}`);
  }
  return [...out];
}
