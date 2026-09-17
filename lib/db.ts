import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;
let openedPath: string | null = null;

export function getDatabasePath() {
  if (process.env.DATABASE_PATH) {
    return path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH);
  }
  return path.join(process.cwd(), "data", "clinic.sqlite");
}

export function getDb(): Database.Database {
  const dbPath = getDatabasePath();
  if (db && openedPath === dbPath) return db;
  if (db) {
    db.close();
    db = null;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  migrate(instance);
  seed(instance);
  db = instance;
  openedPath = dbPath;
  return instance;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    openedPath = null;
  }
}

function migrate(instance: Database.Database) {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      patient_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('Male', 'Female', 'Other', 'Decline to Answer')),
      phone_number TEXT NOT NULL,
      email TEXT,
      address_line_1 TEXT NOT NULL,
      address_line_2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      insurance_provider TEXT,
      insurance_member_id TEXT,
      preferred_language TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
    CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(last_name);
    CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(date_of_birth);
    CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(deleted_at);

    CREATE TABLE IF NOT EXISTS appointments (
      appointment_id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

    CREATE TABLE IF NOT EXISTS call_records (
      call_id TEXT PRIMARY KEY,
      patient_id TEXT,
      vapi_call_id TEXT,
      caller_phone TEXT,
      transcript TEXT,
      summary TEXT,
      ended_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_calls_patient ON call_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_calls_vapi ON call_records(vapi_call_id);
  `);
}

function seed(instance: Database.Database) {
  const count = instance.prepare("SELECT COUNT(*) AS n FROM patients").get() as { n: number };
  if (count.n > 0) return;

  const now = new Date().toISOString();
  instance
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
    .run({
      patient_id: "4c2a1b90-6f3e-4d11-9a7c-12ab34cd56ef",
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1987-03-04",
      sex: "Female",
      phone_number: "4155550100",
      email: "jane.doe@example.com",
      address_line_1: "142 Maple Street",
      address_line_2: "Apt 3B",
      city: "San Francisco",
      state: "CA",
      zip_code: "94110",
      insurance_provider: "Blue Shield of California",
      insurance_member_id: "XG123456",
      preferred_language: "English",
      emergency_contact_name: "John Doe",
      emergency_contact_phone: "4155550199",
      created_at: now,
      updated_at: now,
    });

  instance
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
    .run({
      patient_id: "9e8d7c65-4b3a-4210-8f9e-77aa88bb99cc",
      first_name: "Carlos",
      last_name: "Mendez",
      date_of_birth: "1991-11-18",
      sex: "Male",
      phone_number: "5125550142",
      email: "carlos.mendez@example.com",
      address_line_1: "88 Rio Grande Ave",
      address_line_2: null,
      city: "Austin",
      state: "TX",
      zip_code: "78701",
      insurance_provider: null,
      insurance_member_id: null,
      preferred_language: "Spanish",
      emergency_contact_name: "Ana Mendez",
      emergency_contact_phone: "5125550188",
      created_at: now,
      updated_at: now,
    });

  const nextWeek = new Date();
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  nextWeek.setUTCHours(15, 30, 0, 0);

  instance
    .prepare(
      `INSERT INTO appointments (appointment_id, patient_id, scheduled_at, reason, status, created_at)
       VALUES (@appointment_id, @patient_id, @scheduled_at, @reason, 'scheduled', @created_at)`,
    )
    .run({
      appointment_id: "a1b2c3d4-e5f6-7890-ab12-cd34ef56ab78",
      patient_id: "4c2a1b90-6f3e-4d11-9a7c-12ab34cd56ef",
      scheduled_at: nextWeek.toISOString(),
      reason: "New patient physical",
      created_at: now,
    });

  instance
    .prepare(
      `INSERT INTO call_records (
        call_id, patient_id, vapi_call_id, caller_phone, transcript, summary, ended_reason, created_at
      ) VALUES (
        @call_id, @patient_id, @vapi_call_id, @caller_phone, @transcript, @summary, @ended_reason, @created_at
      )`,
    )
    .run({
      call_id: "c0ffee00-1111-2222-3333-444455556666",
      patient_id: "4c2a1b90-6f3e-4d11-9a7c-12ab34cd56ef",
      vapi_call_id: "seed-call-jane",
      caller_phone: "4155550100",
      transcript:
        "Avery: Hi, thanks for calling Northwind Family Clinic. I'm Avery. What name should I start with?\nJane: Jane Doe.\nAvery: Thanks, Jane. And your date of birth?\nJane: March 4th, 1987.\nAvery: You're all set, Jane.",
      summary: "Jane Doe completed registration and confirmed demographics. First appointment booked for a new-patient physical.",
      ended_reason: "assistant-ended-call",
      created_at: now,
    });
}
