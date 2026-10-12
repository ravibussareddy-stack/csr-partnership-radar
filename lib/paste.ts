/**
 * Splits a block of pasted messages into individual messages.
 * Supported: separator lines (-----, =====, ___, ***), "Message 2:" / "Msg #3" headers, and
 * WhatsApp "Export chat" lines ("[12/10/26, 9:41 AM] Name: text" or "12/10/2026, 21:41 - Name: text").
 * Sender names are dropped (data minimisation); WhatsApp timestamps become the message date.
 */
export interface PastedMessage {
  text: string;
  date: Date | null;
}

const MAX_MESSAGES = 100;
const MAX_CHARS = 5000;
const SEPARATOR = /^\s*[-_=*~—–]{3,}\s*$/;
const HEADER = /^\s*(?:message|msg)\s*#?\s*\d+\s*[:.)\-–]?\s*/i;
const WHATSAPP = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?([^:]{1,80}):\s?(.*)$/;
const WHATSAPP_SYSTEM = /(end-to-end encrypted|<media omitted>|this message was deleted|missed voice call|missed video call|joined using this group|created group|added you|changed the subject)/i;

function whatsappDate(m: RegExpMatchArray): Date | null {
  const [d, mo, yRaw, hRaw, min, ampm] = [Number(m[1]), Number(m[2]), m[3], Number(m[4]), Number(m[5]), m[6]];
  const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  let h = hRaw;
  if (ampm) {
    const pm = /p/i.test(ampm);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  // India-style day/month order; IST (+05:30) → UTC.
  const dt = new Date(Date.UTC(y, mo - 1, d, h, min) - 330 * 60_000);
  return Number.isNaN(dt.getTime()) || mo > 12 || d > 31 ? null : dt;
}

export function splitMessages(input: string): PastedMessage[] {
  const lines = input.replace(/\r\n?/g, "\n").replace(/‎|‏/g, "").split("\n");
  const out: PastedMessage[] = [];
  const waLines = lines.filter((l) => WHATSAPP.test(l)).length;

  if (waLines >= 2) {
    let cur: PastedMessage | null = null;
    for (const line of lines) {
      const m = line.match(WHATSAPP);
      if (m) {
        if (cur) out.push(cur);
        cur = WHATSAPP_SYSTEM.test(m[8]) ? null : { text: m[8], date: whatsappDate(m) };
      } else if (cur && line.trim()) {
        cur.text += `\n${line}`;
      }
    }
    if (cur) out.push(cur);
  } else {
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join("\n").trim();
      if (text) out.push({ text, date: null });
      buf = [];
    };
    for (const line of lines) {
      if (SEPARATOR.test(line)) {
        flush();
      } else if (HEADER.test(line)) {
        flush();
        const rest = line.replace(HEADER, "");
        if (rest.trim()) buf.push(rest);
      } else {
        buf.push(line);
      }
    }
    flush();
  }
  return out
    .map((m) => ({ ...m, text: m.text.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.text.length >= 15)
    .slice(0, MAX_MESSAGES);
}
