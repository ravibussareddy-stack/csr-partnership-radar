/**
 * Job-posting link checks: reject generic job-portal pages, require a specific posting URL, and
 * (where robots.txt allows) confirm the page is live and not marked expired.
 * Status: ok | unverified (site disallows checks) | generic | dead | expired.
 */
export type LinkStatus = "ok" | "unverified" | "generic" | "dead" | "expired";

const SPECIFIC: RegExp[] = [
  /linkedin\.com\/jobs\/view\/[^/?#]*\d{6,}/i,
  /naukri\.com\/job-listings-/i,
  /indeed\.[a-z.]+\/(viewjob|rc\/clk|.*[?&]jk=)/i,
  /foundit\.in\/job\//i,
  /glassdoor\.[a-z.]+\/job-listing\//i,
  /iimjobs\.com\/j\//i,
  /hirist\.(com|tech)\/j\//i,
  /instahyre\.com\/job-\d+/i,
  /devnetjobsindia\.org\/(rfp_)?job_description\.aspx\?/i,
];
const GENERIC: RegExp[] = [
  /linkedin\.com\/jobs\/?(search|collections|$|\?)/i,
  /naukri\.com\/[a-z0-9-]*-jobs(-in-[a-z-]+)?\/?($|\?)/i,
  /indeed\.[a-z.]+\/(jobs|q-[^/]*|m\/jobs)\/?($|\?)/i,
  /foundit\.in\/(srp|search)/i,
  /glassdoor\.[a-z.]+\/Job\/.*SRCH/i,
  /\/(jobs|careers|career|openings|vacancies)\/?($|\?)/i,
];
const CAREERS_WITH_ID = /(job|career|position|opening|requisition|vacanc)[a-z_-]*\/[^?#]*(\d{4,}|[a-z0-9-]{24,})/i;
const EXPIRED = /(no longer accepting applications|job (has )?expired|this job is (closed|no longer available)|position (has been )?filled|job not found|posting (has been )?(removed|closed)|this job has been removed)/i;

export function classifyJobUrl(url: string): "specific" | "generic" {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "generic";
  }
  if (u.pathname === "/" || u.pathname === "") return "generic";
  if (SPECIFIC.some((r) => r.test(url))) return "specific";
  if (GENERIC.some((r) => r.test(url))) return "generic";
  return CAREERS_WITH_ID.test(url) ? "specific" : "generic";
}

/** fetcher.get returns null when robots.txt disallows, throws on HTTP errors. */
export async function checkJobLink(url: string, fetcher: { get(url: string): Promise<string | null> }): Promise<LinkStatus> {
  if (classifyJobUrl(url) === "generic") return "generic";
  try {
    const html = await fetcher.get(url);
    if (html === null) return "unverified";
    return EXPIRED.test(html.slice(0, 200_000)) ? "expired" : "ok";
  } catch (err) {
    const m = (err as Error).message.match(/HTTP (\d{3})/);
    if (m && ["404", "410"].includes(m[1])) return "dead";
    return "unverified"; // 403 / timeouts: can't tell
  }
}
