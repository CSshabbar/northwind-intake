import { fail, ok } from "@/lib/http";
import { listAppointments } from "@/lib/appointments";
import { getPatient } from "@/lib/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getPatient(id)) return fail(404, "Patient not found");
  return ok(listAppointments(id));
}
