/** npm run test:joblinks — job URL classification (specific posting vs generic portal page). */
import assert from "node:assert/strict";
import { classifyJobUrl } from "../lib/joblinks";

const cases: [string, "specific" | "generic"][] = [
  ["https://jobs.siemens.com/en_US/externaljobs/JobDetail/523649", "specific"],
  ["https://careers.sterliteelectric.com/job/Latur-Manager-CSR/1368348066/", "specific"],
  ["https://www.linkedin.com/jobs/view/csr-manager-at-acme-3999123456", "specific"],
  ["https://www.naukri.com/job-listings-csr-manager-acme-pune-5-to-8-years-101024000123", "specific"],
  ["https://in.indeed.com/q-maruti-suzuki-company-l-patparganj,-delhi,-delhi-jobs.html", "generic"],
  ["https://www.simplyhired.co.in/search?q=music", "generic"],
  ["https://www.linkedin.com/jobs/search?keywords=csr", "generic"],
  ["https://www.naukri.com/csr-manager-jobs-in-pune", "generic"],
  ["https://acme.com/careers", "generic"],
];
for (const [url, want] of cases) assert.equal(classifyJobUrl(url), want, url);
console.log("job links: all tests passed");
