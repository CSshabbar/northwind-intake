import { scheduleFirstAppointment } from "@/lib/appointments";
import { upsertCallRecord } from "@/lib/calls";
import { fail, ok } from "@/lib/http";
import {
  DuplicatePhoneError,
  NotFoundError,
  createPatient,
  findPatientByPhone,
  getPatient,
  updatePatient,
} from "@/lib/patients";
import { formatPhone } from "@/lib/phone";
import {
  formatZodError,
  isoToUsDate,
  patientCreateSchema,
  patientUpdateSchema,
} from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

const saveSchema = patientCreateSchema.extend({
  confirmed: z.boolean().optional(),
  update_existing: z.boolean().optional(),
  patient_id: z.string().uuid().optional(),
});

function webhookAuthorized(request: Request): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return true;
  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-vapi-secret");
  return (
    auth === `Bearer ${secret}` ||
    headerSecret === secret ||
    url.searchParams.get("token") === secret
  );
}

function parseToolCalls(payload: Record<string, unknown>): ToolCall[] {
  const message = (payload.message ?? payload) as Record<string, unknown>;
  const calls =
    (message.toolCallList as unknown[]) ||
    (message.toolCalls as unknown[]) ||
    ((message.toolWithToolCallList as Array<{ toolCall?: unknown }>) ?? []).map(
      (item) => item.toolCall,
    ) ||
    [];

  return (calls as unknown[]).filter(Boolean).map((raw) => {
    const item = raw as Record<string, unknown>;
    const fn = (item.function as Record<string, unknown> | undefined) ?? item;
    const args = fn.arguments ?? item.parameters ?? item.arguments ?? {};
    const parsedArgs =
      typeof args === "string" ? (JSON.parse(args) as Record<string, unknown>) : (args as Record<string, unknown>);
    return {
      id: String(item.id ?? item.toolCallId ?? fn.id ?? ""),
      name: String(fn.name ?? item.name ?? ""),
      arguments: parsedArgs ?? {},
    };
  });
}

function toolResult(toolCallId: string, result: unknown) {
  return {
    toolCallId,
    result: typeof result === "string" ? result : JSON.stringify(result),
  };
}

function summarizePatient(patient: {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone_number: string;
  email: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  preferred_language: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  patient_id: string;
}) {
  return {
    patient_id: patient.patient_id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    date_of_birth: isoToUsDate(patient.date_of_birth),
    sex: patient.sex,
    phone_number: formatPhone(patient.phone_number),
    email: patient.email,
    address: [patient.address_line_1, patient.address_line_2, `${patient.city}, ${patient.state} ${patient.zip_code}`]
      .filter(Boolean)
      .join(", "),
    insurance_provider: patient.insurance_provider,
    insurance_member_id: patient.insurance_member_id,
    preferred_language: patient.preferred_language,
    emergency_contact_name: patient.emergency_contact_name,
    emergency_contact_phone: patient.emergency_contact_phone
      ? formatPhone(patient.emergency_contact_phone)
      : null,
  };
}

async function handleLookup(args: Record<string, unknown>) {
  const phone = String(args.phone_number ?? args.phone ?? "");
  const patient = findPatientByPhone(phone);
  if (!patient) {
    return {
      found: false,
      message: "No existing patient with that phone number. Continue as a new registration.",
    };
  }
  return {
    found: true,
    message: `It looks like we already have a record for ${patient.first_name} ${patient.last_name}. Ask if they want to update that information instead of creating a new chart.`,
    patient: summarizePatient(patient),
  };
}

async function handleSave(args: Record<string, unknown>, callId?: string, callerPhone?: string) {
  if (args.confirmed === false) {
    return {
      saved: false,
      message: "Do not save yet. Read the information back and get an explicit yes first.",
    };
  }

  const parsed = saveSchema.safeParse(args);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    return {
      saved: false,
      validation_error: true,
      message: `The record is not valid yet: ${formatted.message}. Re-prompt specifically for that field, then confirm again.`,
      details: formatted.details,
    };
  }

  const { confirmed: _confirmed, update_existing, patient_id, ...demographics } = parsed.data;
  const existingById = patient_id ? getPatient(patient_id) : null;
  const existingByPhone = findPatientByPhone(demographics.phone_number);

  try {
    if (existingById || (update_existing && existingByPhone)) {
      const targetId = existingById?.patient_id ?? existingByPhone!.patient_id;
      const patient = updatePatient(targetId, patientUpdateSchema.parse(demographics));
      upsertCallRecord({
        vapi_call_id: callId,
        patient_id: patient.patient_id,
        caller_phone: callerPhone ?? patient.phone_number,
      });
      return {
        saved: true,
        updated: true,
        message: `Updated ${patient.first_name}'s chart. Give a brief confirmation, then offer to book a first appointment.`,
        patient: summarizePatient(patient),
      };
    }

    const patient = createPatient(demographics);
    upsertCallRecord({
      vapi_call_id: callId,
      patient_id: patient.patient_id,
      caller_phone: callerPhone ?? patient.phone_number,
    });
    return {
      saved: true,
      created: true,
      message: `Saved a new chart for ${patient.first_name}. Confirm they're all set, then offer a first appointment.`,
      patient: summarizePatient(patient),
    };
  } catch (error) {
    if (error instanceof DuplicatePhoneError) {
      return {
        saved: false,
        duplicate: true,
        message: `It looks like we already have a record for ${error.existing.first_name} ${error.existing.last_name}. Ask if they want to update that information instead. If they say yes, call save_patient again with update_existing=true and patient_id=${error.existing.patient_id}.`,
        patient: summarizePatient(error.existing),
      };
    }
    console.error("[intake] save_patient failed", error);
    return {
      saved: false,
      write_failed: true,
      message:
        "The chart could not be saved because of a system error. Apologize, and ask if they would like you to try again. Do not pretend the record was saved.",
    };
  }
}

async function handleAppointment(args: Record<string, unknown>) {
  try {
    const appointment = scheduleFirstAppointment({
      patient_id: String(args.patient_id ?? ""),
      preferred_date: args.preferred_date ? String(args.preferred_date) : undefined,
      preferred_time: args.preferred_time ? String(args.preferred_time) : undefined,
      reason: args.reason ? String(args.reason) : undefined,
    });
    const when = new Date(appointment.scheduled_at);
    const spoken = when.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });
    return {
      scheduled: true,
      appointment_id: appointment.appointment_id,
      scheduled_at: appointment.scheduled_at,
      spoken_time: spoken,
      reason: appointment.reason,
      message: `Booked a first visit for ${spoken}. Read that time back and then end the call.`,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return {
        scheduled: false,
        message: "Save the patient record before booking an appointment.",
      };
    }
    console.error("[intake] schedule_first_appointment failed", error);
    return {
      scheduled: false,
      message: "Appointment booking failed. Offer to have the front desk follow up instead.",
    };
  }
}

function extractCallMeta(payload: Record<string, unknown>) {
  const message = (payload.message ?? payload) as Record<string, unknown>;
  const call = (message.call ?? payload.call ?? {}) as Record<string, unknown>;
  const customer = (call.customer ?? {}) as Record<string, unknown>;
  const artifact = (message.artifact ?? {}) as Record<string, unknown>;
  const analysis = (message.analysis ?? {}) as Record<string, unknown>;
  return {
    callId: typeof call.id === "string" ? call.id : undefined,
    callerPhone:
      typeof customer.number === "string"
        ? customer.number
        : typeof call.phoneNumber === "string"
          ? call.phoneNumber
          : undefined,
    transcript:
      typeof artifact.transcript === "string"
        ? artifact.transcript
        : typeof message.transcript === "string"
          ? message.transcript
          : null,
    summary:
      typeof analysis.summary === "string"
        ? analysis.summary
        : typeof artifact.summary === "string"
          ? artifact.summary
          : typeof message.summary === "string"
            ? message.summary
            : null,
    endedReason: typeof message.endedReason === "string" ? message.endedReason : null,
  };
}

export async function POST(request: Request) {
  if (!webhookAuthorized(request)) {
    return fail(401, "Unauthorized webhook", "UNAUTHORIZED");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Webhook body must be JSON", "BAD_JSON");
  }

  const message = (payload.message ?? payload) as Record<string, unknown>;
  const type = String(message.type ?? "");
  const meta = extractCallMeta(payload);

  if (type === "end-of-call-report") {
    const record = upsertCallRecord({
      vapi_call_id: meta.callId,
      caller_phone: meta.callerPhone,
      transcript: meta.transcript,
      summary: meta.summary,
      ended_reason: meta.endedReason,
    });
    console.log(
      "[intake] end-of-call-report",
      JSON.stringify({
        call_id: record.call_id,
        vapi_call_id: record.vapi_call_id,
        patient_id: record.patient_id,
        ended_reason: record.ended_reason,
        summary: record.summary,
      }),
    );
    return ok({ stored: true, call_id: record.call_id });
  }

  if (type === "tool-calls" || type === "function-call" || parseToolCalls(payload).length > 0) {
    const calls = parseToolCalls(payload);
    const results = [];
    for (const call of calls) {
      console.log("[intake] tool-call", JSON.stringify({ name: call.name, arguments: call.arguments }));
      try {
        if (call.name === "lookup_patient_by_phone") {
          results.push(toolResult(call.id, await handleLookup(call.arguments)));
        } else if (call.name === "save_patient") {
          results.push(toolResult(call.id, await handleSave(call.arguments, meta.callId, meta.callerPhone)));
        } else if (call.name === "schedule_first_appointment") {
          results.push(toolResult(call.id, await handleAppointment(call.arguments)));
        } else {
          results.push(toolResult(call.id, { ok: false, message: `Unknown tool ${call.name}` }));
        }
      } catch (error) {
        console.error("[intake] tool handler failed", call.name, error);
        results.push(
          toolResult(call.id, {
            ok: false,
            write_failed: true,
            message:
              "A system error occurred. Tell the caller something went wrong and offer to try again. Do not claim the data was saved.",
          }),
        );
      }
    }
    return Response.json({ results });
  }

  return ok({ received: type || "unknown" });
}
