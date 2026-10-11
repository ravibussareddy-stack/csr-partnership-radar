export interface YearRow {
  fy: number; // FY start year (2024 = FY2024-25)
  total: number; // ₹ crore, all sectors
  focus: number; // ₹ crore, focus sectors
  projects: number; // project lines reported
  maharashtra: number; // ₹ crore in Maharashtra, all sectors
  pune: number; // ₹ crore in Pune district, all sectors
}

export interface Range {
  low: number;
  mid: number;
  high: number;
}

export interface Timing {
  /** "company": from this company's dated news; "sector": sector-wide pattern; "none": no data */
  basis: "company" | "sector" | "none";
  events: number;
  /** news mentions per calendar month, Jan..Dec */
  months: number[];
  /** e.g. "Aug–Oct" */
  window: string | null;
  /** share of events falling in the window, 0..1 */
  windowShare: number;
  /** ISO date of the next start of the window */
  nextWindowStart: string | null;
  lastEvent: string | null;
  /** year-consistency of the window: "clear" = hit in ≥ 60% of ≥ 4 active years, "mild" ≥ 40%, else "none" */
  strength: "clear" | "mild" | "none";
  /** which headlines were counted */
  counted: "announcements" | "all_headlines";
  /** announcements per calendar month for each year (company basis), oldest year first */
  grid: { year: number; months: number[] }[];
  /** years with ≥1 announcement inside the window vs years with any announcement */
  recurrence: { yearsHit: number[]; activeYears: number[]; share: number };
}

export interface CompanyStatsData {
  isPsu: boolean | null;
  byYear: YearRow[];
  /** last 3 reported FYs, ₹ crore by sector */
  sectorsRecent: { sector: string; focusId: string | null; amount: number }[];
  /** chance of spending in each sector next FY, from the last 5 FYs */
  sectorOdds: { sector: string; focusId: string | null; p: number }[];
  topStates: { state: string; amount: number }[];
  topDistricts: { district: string; state: string; amount: number }[];
  prediction: {
    fy: number;
    total: Range;
    focus: Range;
    projects: number;
    method: string;
  };
  timing: Timing;
}
