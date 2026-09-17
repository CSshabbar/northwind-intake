import { ok } from "@/lib/http";
import { listAppointments } from "@/lib/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(listAppointments());
}
