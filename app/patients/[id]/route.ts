import { fail, ok, readJson } from "@/lib/http";
import {
  DuplicatePhoneError,
  NotFoundError,
  getPatient,
  softDeletePatient,
  updatePatient,
} from "@/lib/patients";
import { formatZodError, patientUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const patient = getPatient(id);
    if (!patient) return fail(404, "Patient not found");
    return ok(patient);
  } catch (error) {
    console.error("[api] GET /patients/:id failed", error);
    return fail(500, "Failed to retrieve patient");
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const result = patientUpdateSchema.safeParse(parsed.body);
  if (!result.success) {
    const formatted = formatZodError(result.error);
    return fail(422, formatted.message, "VALIDATION_ERROR", formatted.details);
  }

  try {
    const { id } = await context.params;
    const patient = updatePatient(id, result.data);
    return ok(patient);
  } catch (error) {
    if (error instanceof NotFoundError) return fail(404, error.message);
    if (error instanceof DuplicatePhoneError) {
      return fail(422, error.message, "DUPLICATE_PHONE", {
        existing_patient_id: error.existing.patient_id,
      });
    }
    console.error("[api] PUT /patients/:id failed", error);
    return fail(500, "Failed to update patient");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const patient = softDeletePatient(id);
    return ok(patient);
  } catch (error) {
    if (error instanceof NotFoundError) return fail(404, error.message);
    console.error("[api] DELETE /patients/:id failed", error);
    return fail(500, "Failed to delete patient");
  }
}
