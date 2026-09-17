import type { NextRequest } from "next/server";
import { fail, ok, readJson } from "@/lib/http";
import { DuplicatePhoneError, createPatient, listPatients } from "@/lib/patients";
import { formatZodError, patientCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const patients = listPatients({
      last_name: url.searchParams.get("last_name") ?? undefined,
      date_of_birth: url.searchParams.get("date_of_birth") ?? undefined,
      phone_number: url.searchParams.get("phone_number") ?? undefined,
    });
    return ok(patients);
  } catch (error) {
    console.error("[api] GET /patients failed", error);
    return fail(500, "Failed to list patients");
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const result = patientCreateSchema.safeParse(parsed.body);
  if (!result.success) {
    const formatted = formatZodError(result.error);
    return fail(422, formatted.message, "VALIDATION_ERROR", formatted.details);
  }

  try {
    const patient = createPatient(result.data);
    return ok(patient, 201);
  } catch (error) {
    if (error instanceof DuplicatePhoneError) {
      return fail(422, error.message, "DUPLICATE_PHONE", {
        existing_patient_id: error.existing.patient_id,
        first_name: error.existing.first_name,
        last_name: error.existing.last_name,
      });
    }
    console.error("[api] POST /patients failed", error);
    return fail(500, "Failed to create patient");
  }
}
