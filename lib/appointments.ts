import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getPatient, NotFoundError } from "./patients";
import type { Appointment } from "./types";

function nextBusinessMorning(preferredDate?: string, preferredTime?: string): Date {
  if (preferredDate) {
    const [y, m, d] = preferredDate.split("-").map(Number);
    const [hh, mm] = (preferredTime ?? "09:30").split(":").map(Number);
    if (y && m && d) {
      return new Date(Date.UTC(y, m - 1, d, (hh ?? 9) + 4, mm ?? 30, 0));
    }
  }

  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(13, 30, 0, 0);
  date.setUTCDate(date.getUTCDate() + 1);
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function listAppointments(patientId?: string): Appointment[] {
  const db = getDb();
  if (patientId) {
    return db
      .prepare(
        "SELECT * FROM appointments WHERE patient_id = ? ORDER BY scheduled_at ASC",
      )
      .all(patientId) as Appointment[];
  }
  return db
    .prepare("SELECT * FROM appointments ORDER BY scheduled_at ASC")
    .all() as Appointment[];
}

export function scheduleFirstAppointment(input: {
  patient_id: string;
  preferred_date?: string;
  preferred_time?: string;
  reason?: string;
}): Appointment {
  const patient = getPatient(input.patient_id);
  if (!patient) throw new NotFoundError("Patient not found for appointment");

  const scheduledAt = nextBusinessMorning(input.preferred_date, input.preferred_time);
  const appointment: Appointment = {
    appointment_id: randomUUID(),
    patient_id: patient.patient_id,
    scheduled_at: scheduledAt.toISOString(),
    reason: input.reason?.trim() || "New patient visit",
    status: "scheduled",
    created_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO appointments (appointment_id, patient_id, scheduled_at, reason, status, created_at)
       VALUES (@appointment_id, @patient_id, @scheduled_at, @reason, @status, @created_at)`,
    )
    .run(appointment);

  console.log(
    "[intake] scheduled appointment",
    JSON.stringify({
      appointment_id: appointment.appointment_id,
      patient_id: appointment.patient_id,
      scheduled_at: appointment.scheduled_at,
      reason: appointment.reason,
    }),
  );

  return appointment;
}
