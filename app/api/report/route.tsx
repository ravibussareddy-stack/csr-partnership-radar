// GET /api/report — the week's highlights as a downloadable PDF (button on the Summary page).
// Built at request time from the same cached data as the pages: read-only, no AI calls in Vercel.
import { connection } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadWeeklyReport } from "@/lib/report";
import { Report } from "@/lib/report-pdf";

export async function GET() {
  await connection();
  const report = await loadWeeklyReport();
  if (!report) return new Response("The weekly report needs the database; it is not configured here.", { status: 503 });
  const pdf = await renderToBuffer(<Report r={report} />);
  const name = `csr-radar-weekly-report-${report.week.replace(" ", "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
