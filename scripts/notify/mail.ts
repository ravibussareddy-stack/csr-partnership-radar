/** Gmail SMTP sender shared by the digest email, call alerts and the pipeline health check. */
import nodemailer from "nodemailer";

export const SUBJECT_TAG = "[CSR Radar]";

/** App password from NOTIFY_SMTP_* (falls back to the intake inbox's). Null when not configured. */
export function transport() {
  const user = process.env.NOTIFY_SMTP_USER ?? process.env.INTAKE_IMAP_USER;
  const pass = process.env.NOTIFY_SMTP_PASSWORD ?? process.env.INTAKE_IMAP_PASSWORD;
  if (!user || !pass) return null;
  return { from: user, t: nodemailer.createTransport({ host: process.env.NOTIFY_SMTP_HOST ?? "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }) };
}
