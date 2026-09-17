import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { normalizePhone } from "./phone";
import type { Patient, PatientFilters } from "./types";
import type { PatientCreateInput, PatientUpdateInput } from "./validation";
import { toIsoDate } from "./validation";

type PatientRow = Patient;

function nowIso() {
  return new Date().toISOString();
}

export class DuplicatePhoneError extends Error {
  existing: Patient;
  constructor(existing: Patient) {
    super(
      `A patient with this phone number already exists: ${existing.first_name} ${existing.last_name}`,
    );
    this.name = "DuplicatePhoneError";
    this.existing = existing;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Patient not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function listPatients(filters: PatientFilters = {}): Patient[] {
  const db = getDb();
  const clauses = ["deleted_at IS NULL"];
  const params: Record<string, string> = {};

  if (filters.last_name) {
    clauses.push("LOWER(last_name) = LOWER(@last_name)");
    params.last_name = filters.last_name.trim();
  }
  if (filters.date_of_birth) {
    const iso = toIsoDate(filters.date_of_birth) ?? filters.date_of_birth.trim();
    clauses.push("date_of_birth = @date_of_birth");
    params.date_of_birth = iso;
  }
  if (filters.phone_number) {
    const phone = normalizePhone(filters.phone_number) ?? filters.phone_number.replace(/\D/g, "");
    clauses.push("phone_number = @phone_number");
    params.phone_number = phone;
  }

  const sql = `SELECT * FROM patients WHERE ${clauses.join(" AND ")} ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`;
  return db.prepare(sql).all(params) as PatientRow[];
}

export function getPatient(patientId: string): Patient | null {
  const row = getDb()
    .prepare("SELECT * FROM patients WHERE patient_id = ? AND deleted_at IS NULL")
    .get(patientId) as PatientRow | undefined;
  return row ?? null;
}

export function findPatientByPhone(phoneNumber: string): Patient | null {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;
  const row = getDb()
    .prepare("SELECT * FROM patients WHERE phone_number = ? AND deleted_at IS NULL")
    .get(phone) as PatientRow | undefined;
  return row ?? null;
}

export function createPatient(input: PatientCreateInput): Patient {
  const existing = findPatientByPhone(input.phone_number);
  if (existing) {
    throw new DuplicatePhoneError(existing);
  }

  const timestamp = nowIso();
  const patient: Patient = {
    patient_id: randomUUID(),
    first_name: input.first_name,
    last_name: input.last_name,
    date_of_birth: input.date_of_birth,
    sex: input.sex,
    phone_number: input.phone_number,
    email: input.email ?? null,
    address_line_1: input.address_line_1,
    address_line_2: input.address_line_2 ?? null,
    city: input.city,
    state: input.state,
    zip_code: input.zip_code,
    insurance_provider: input.insurance_provider ?? null,
    insurance_member_id: input.insurance_member_id ?? null,
    preferred_language: input.preferred_language ?? "English",
    emergency_contact_name: input.emergency_contact_name ?? null,
    emergency_contact_phone: input.emergency_contact_phone ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO patients (
        patient_id, first_name, last_name, date_of_birth, sex, phone_number, email,
        address_line_1, address_line_2, city, state, zip_code, insurance_provider,
        insurance_member_id, preferred_language, emergency_contact_name,
        emergency_contact_phone, created_at, updated_at, deleted_at
      ) VALUES (
        @patient_id, @first_name, @last_name, @date_of_birth, @sex, @phone_number, @email,
        @address_line_1, @address_line_2, @city, @state, @zip_code, @insurance_provider,
        @insurance_member_id, @preferred_language, @emergency_contact_name,
        @emergency_contact_phone, @created_at, @updated_at, NULL
      )`,
    )
    .run(patient);

  console.log(
    "[intake] created patient",
    JSON.stringify({
      patient_id: patient.patient_id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth,
      sex: patient.sex,
      phone_number: patient.phone_number,
      email: patient.email,
      address_line_1: patient.address_line_1,
      address_line_2: patient.address_line_2,
      city: patient.city,
      state: patient.state,
      zip_code: patient.zip_code,
      insurance_provider: patient.insurance_provider,
      insurance_member_id: patient.insurance_member_id,
      preferred_language: patient.preferred_language,
      emergency_contact_name: patient.emergency_contact_name,
      emergency_contact_phone: patient.emergency_contact_phone,
    }),
  );

  return patient;
}

export function updatePatient(patientId: string, input: PatientUpdateInput): Patient {
  const existing = getPatient(patientId);
  if (!existing) throw new NotFoundError();

  if (input.phone_number && input.phone_number !== existing.phone_number) {
    const clash = findPatientByPhone(input.phone_number);
    if (clash && clash.patient_id !== patientId) {
      throw new DuplicatePhoneError(clash);
    }
  }

  const updated: Patient = {
    ...existing,
    ...stripUndefined(input),
    patient_id: existing.patient_id,
    created_at: existing.created_at,
    updated_at: nowIso(),
    deleted_at: null,
  };

  getDb()
    .prepare(
      `UPDATE patients SET
        first_name = @first_name,
        last_name = @last_name,
        date_of_birth = @date_of_birth,
        sex = @sex,
        phone_number = @phone_number,
        email = @email,
        address_line_1 = @address_line_1,
        address_line_2 = @address_line_2,
        city = @city,
        state = @state,
        zip_code = @zip_code,
        insurance_provider = @insurance_provider,
        insurance_member_id = @insurance_member_id,
        preferred_language = @preferred_language,
        emergency_contact_name = @emergency_contact_name,
        emergency_contact_phone = @emergency_contact_phone,
        updated_at = @updated_at
      WHERE patient_id = @patient_id AND deleted_at IS NULL`,
    )
    .run(updated);

  console.log(
    "[intake] updated patient",
    JSON.stringify({
      patient_id: updated.patient_id,
      fields: Object.keys(stripUndefined(input)),
      payload: stripUndefined(input),
    }),
  );

  return updated;
}

export function softDeletePatient(patientId: string): Patient {
  const existing = getPatient(patientId);
  if (!existing) throw new NotFoundError();
  const deletedAt = nowIso();
  getDb()
    .prepare(
      "UPDATE patients SET deleted_at = @deleted_at, updated_at = @deleted_at WHERE patient_id = @patient_id",
    )
    .run({ patient_id: patientId, deleted_at: deletedAt });
  console.log("[intake] soft-deleted patient", JSON.stringify({ patient_id: patientId }));
  return { ...existing, deleted_at: deletedAt, updated_at: deletedAt };
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
