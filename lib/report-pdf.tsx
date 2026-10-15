/** The weekly report's PDF layout (@react-pdf/renderer). Content comes from lib/report.ts. */
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { pdfText as t } from "@/lib/pdf-text";
import type { ReportItem, WeeklyReport } from "@/lib/report";

const SITE = process.env.SITE_URL ?? "https://csr-partnership-radar-two.vercel.app";
const C = { ink: "#1f2a24", muted: "#5f6a62", accent: "#128a63", call: "#c2462a", watch: "#8a6100", line: "#e3ddd0", band: "#eaf6f0" };

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink, lineHeight: 1.35 },
  band: { backgroundColor: C.band, borderRadius: 8, padding: 14, marginBottom: 14 },
  eyebrow: { fontSize: 8, color: C.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase" },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4, lineHeight: 1.2 },
  sub: { color: C.muted, marginTop: 3 },
  stats: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  stat: { width: "33.33%", paddingRight: 8, marginBottom: 8 },
  statNum: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.accent, lineHeight: 1.2, marginBottom: 1 },
  statLabel: { fontSize: 8, color: C.muted },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.line },
  note: { color: C.muted, fontSize: 8.5, marginBottom: 4 },
  item: { marginBottom: 7, paddingLeft: 8, borderLeftWidth: 2.5 },
  meta: { fontSize: 8, color: C.muted },
  co: { fontFamily: "Helvetica-Bold", color: C.ink },
  title: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 1 },
  why: { marginTop: 1 },
  link: { color: C.accent, fontSize: 8, textDecoration: "none", marginTop: 1 },
  row: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 10, color: C.muted },
  rowText: { flex: 1 },
  footerL: { position: "absolute", bottom: 22, left: 40, fontSize: 7.5, color: C.muted },
});

function Items({ items, color, empty }: { items: ReportItem[]; color: string; empty: string }) {
  if (items.length === 0) return <Text style={s.note}>{empty}</Text>;
  return (
    <>
      {items.map((i, k) => (
        <View key={k} style={[s.item, { borderLeftColor: color }]} wrap={false}>
          <Text style={s.meta}>
            <Text style={s.co}>{t(i.company)}</Text> · {t(i.tag)}
          </Text>
          <Text style={s.title}>{t(i.title)}</Text>
          {i.why ? <Text style={s.why}>{t(i.why)}</Text> : null}
          {i.url ? <Link src={i.url} style={s.link}>{t(i.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 90))}</Link> : null}
        </View>
      ))}
    </>
  );
}

export function Report({ r }: { r: WeeklyReport }) {
  return (
    <Document title={`CSR Partnership Radar weekly report ${r.week}`} author="CSR Partnership Radar">
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.eyebrow}>CSR Partnership Radar · Weekly report · {r.week}</Text>
          <Text style={s.h1}>This week at a glance</Text>
          <Text style={s.sub}>
            {t(r.range)} · data updated {t(r.updatedAt ?? "n/a")} · generated {t(r.generatedAt)} IST
          </Text>
        </View>

        <View style={s.stats}>
          {r.numbers.map((n) => (
            <View key={n.label} style={s.stat}>
              <Text style={s.statNum}>{t(n.value)}</Text>
              <Text style={s.statLabel}>{t(n.label)}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>1 · Call this week</Text>
        <Text style={s.note}>Open opportunity = the company is asking for partners now (respond before it closes). Warm lead = funds your sectors through NGOs (introduce yourself for the next cycle).</Text>
        <Items items={r.calls} color={C.call} empty="No calls this week." />

        {r.introduce.length > 0 && (
          <>
            <Text style={s.h2}>Introduce soon</Text>
            <Text style={s.note}>Good leads that aren&apos;t urgent: the analysis recommends preparing an introduction.</Text>
            <Items items={r.introduce} color={C.accent} empty="" />
          </>
        )}

        <Text style={s.h2}>2 · Watch (top {r.watch.length})</Text>
        <Items items={r.watch} color={C.watch} empty="Nothing on Watch this week." />

        <Text style={s.h2}>3 · Likely to fund Pune &amp; Maharashtra in the next 30 days</Text>
        {r.likelySoon.length === 0 ? (
          <Text style={s.note}>No announcement windows opening in the next 30 days.</Text>
        ) : (
          r.likelySoon.map((c, k) => (
            <View key={k} style={s.row} wrap={false}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.rowText}><Text style={s.co}>{t(c.company)}</Text> · {t(c.detail)}</Text>
            </View>
          ))
        )}

        <Text style={s.h2}>4 · Hiring for CSR (last 30 days)</Text>
        {r.hiring.length === 0 ? (
          <Text style={s.note}>No verified CSR postings in the last 30 days.</Text>
        ) : (
          r.hiring.map((h, k) => (
            <View key={k} style={s.row} wrap={false}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.rowText}>
                <Link src={h.url} style={{ color: C.ink, textDecoration: "none" }}>{t(h.title)}</Link>
                {h.detail ? <Text style={s.meta}>  {t(h.detail)}</Text> : null}
              </Text>
            </View>
          ))
        )}

        <Text style={s.h2}>5 · Rules &amp; regulation</Text>
        {r.regulatory.overview ? <Text style={{ marginBottom: 4 }}>{t(r.regulatory.overview)}</Text> : null}
        {r.regulatory.highlights.map((h, k) => (
          <View key={k} style={s.row} wrap={false}>
            <Text style={s.bullet}>•</Text>
            <Text style={s.rowText}><Text style={s.co}>{t(h.status)}:</Text> {t(h.text)}</Text>
          </View>
        ))}
        {r.regulatory.items.length > 0 && <Text style={[s.note, { marginTop: 4 }]}>New in the last 14 days:</Text>}
        {r.regulatory.items.map((i, k) => (
          <View key={k} style={s.row} wrap={false}>
            <Text style={s.bullet}>•</Text>
            <Text style={s.rowText}>
              <Text style={s.co}>{t(i.status)}</Text> · {t(i.date)} · <Link src={i.url} style={{ color: C.ink, textDecoration: "none" }}>{t(i.title)}</Link>
            </Text>
          </View>
        ))}

        <Text style={[s.note, { marginTop: 14 }]}>
          Every item links to its source. Full detail, reasons and filters: {SITE.replace(/^https:\/\//, "")}. Partner and team activity are left out of this report (team-only).
        </Text>

        <Text style={s.footerL} fixed>
          CSR Partnership Radar · {r.week} · {SITE.replace(/^https:\/\//, "")}
        </Text>
      </Page>
    </Document>
  );
}

