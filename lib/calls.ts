import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { findPatientByPhone, getPatient } from "./patients";
import { normalizePhone } from "./phone";
import type { CallRecord } from "./types";

export function listCalls(patientId?: string): CallRecord[] {
  const db = getDb();
  if (patientId) {
    return db
      .prepare(
        "SELECT * FROM call_records WHERE patient_id = ? ORDER BY created_at DESC",
      )
      .all(patientId) as CallRecord[];
  }
  return db
    .prepare("SELECT * FROM call_records ORDER BY created_at DESC LIMIT 50")
    .all() as CallRecord[];
}

export function upsertCallRecord(input: {
  vapi_call_id?: string | null;
  patient_id?: string | null;
  caller_phone?: string | null;
  transcript?: string | null;
  summary?: string | null;
  ended_reason?: string | null;
}): CallRecord {
  const db = getDb();
  const callerPhone = input.caller_phone ? normalizePhone(input.caller_phone) : null;
  let patientId = input.patient_id ?? null;
  if (!patientId && callerPhone) {
    patientId = findPatientByPhone(callerPhone)?.patient_id ?? null;
  }
  if (patientId && !getPatient(patientId)) {
    patientId = null;
  }

  if (input.vapi_call_id) {
    const existing = db
      .prepare("SELECT * FROM call_records WHERE vapi_call_id = ?")
      .get(input.vapi_call_id) as CallRecord | undefined;
    if (existing) {
      const merged: CallRecord = {
        ...existing,
        patient_id: patientId ?? existing.patient_id,
        caller_phone: callerPhone ?? existing.caller_phone,
        transcript: input.transcript ?? existing.transcript,
        summary: input.summary ?? existing.summary,
        ended_reason: input.ended_reason ?? existing.ended_reason,
      };
      db.prepare(
        `UPDATE call_records SET
          patient_id = @patient_id,
          caller_phone = @caller_phone,
          transcript = @transcript,
          summary = @summary,
          ended_reason = @ended_reason
         WHERE call_id = @call_id`,
      ).run(merged);
      return merged;
    }
  }

  const record: CallRecord = {
    call_id: randomUUID(),
    patient_id: patientId,
    vapi_call_id: input.vapi_call_id ?? null,
    caller_phone: callerPhone,
    transcript: input.transcript ?? null,
    summary: input.summary ?? null,
    ended_reason: input.ended_reason ?? null,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO call_records (
      call_id, patient_id, vapi_call_id, caller_phone, transcript, summary, ended_reason, created_at
    ) VALUES (
      @call_id, @patient_id, @vapi_call_id, @caller_phone, @transcript, @summary, @ended_reason, @created_at
    )`,
  ).run(record);

  return record;
}
