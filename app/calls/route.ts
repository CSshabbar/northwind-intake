import { ok } from "@/lib/http";
import { listCalls } from "@/lib/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(listCalls());
}
