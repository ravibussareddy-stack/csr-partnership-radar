// Optional: ingest workflows POST here (header x-revalidate-secret) so pages refresh right after new data lands.
import { revalidateTag } from "next/cache";
import { RADAR_TAG } from "@/lib/data";

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }
  revalidateTag(RADAR_TAG, "max");
  return Response.json({ ok: true });
}
