import { fail, ok } from "@/lib/http";
import { listCalls } from "@/lib/calls";
import { getPatient } from "@/lib/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getPatient(id)) return fail(404, "Patient not found");
  return ok(listCalls(id));
}
