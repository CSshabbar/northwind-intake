import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getPatients, POST as postPatients } from "../app/patients/route";
import { DELETE as deletePatient, GET as getPatientRoute, PUT as putPatient } from "../app/patients/[id]/route";
import { closeDb, getDatabasePath, getDb } from "../lib/db";
import {
  DuplicatePhoneError,
  createPatient,
  findPatientByPhone,
  getPatient,
  listPatients,
  softDeletePatient,
  updatePatient,
} from "../lib/patients";
import { scheduleFirstAppointment } from "../lib/appointments";
import { patientCreateSchema, toIsoDate } from "../lib/validation";
import { NextRequest } from "next/server";

const validPatient = {
  first_name: "Maya",
  last_name: "O'Neil",
  date_of_birth: "04/12/1990",
  sex: "Female",
  phone_number: "(202) 555-0147",
  email: "maya.oneil@example.com",
  address_line_1: "10 Dupont Circle",
  city: "Washington",
  state: "DC",
  zip_code: "20036",
};

function resetDatabase() {
  closeDb();
  const dbPath = getDatabasePath();
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  getDb();
}

beforeEach(() => {
  resetDatabase();
});

afterEach(() => {
  closeDb();
});

describe("validation", () => {
  it("accepts US dates and phone formatting", () => {
    const parsed = patientCreateSchema.parse(validPatient);
    expect(parsed.date_of_birth).toBe("1990-04-12");
    expect(parsed.phone_number).toBe("2025550147");
    expect(parsed.state).toBe("DC");
  });

  it("rejects a future date of birth", () => {
    const result = patientCreateSchema.safeParse({
      ...validPatient,
      date_of_birth: "01/01/2999",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 3-digit phone number", () => {
    const result = patientCreateSchema.safeParse({
      ...validPatient,
      phone_number: "415",
    });
    expect(result.success).toBe(false);
  });

  it("parses spoken-style ISO and US dates", () => {
    expect(toIsoDate("3/4/1987")).toBe("1987-03-04");
    expect(toIsoDate("1987-03-04")).toBe("1987-03-04");
    expect(toIsoDate("02/31/1990")).toBeNull();
  });
});

describe("patient service", () => {
  it("seeds two demo patients", () => {
    const patients = listPatients();
    expect(patients).toHaveLength(2);
    expect(patients.map((item) => item.last_name).sort()).toEqual(["Doe", "Mendez"]);
  });

  it("creates, updates, filters, and soft-deletes", () => {
    const created = createPatient(patientCreateSchema.parse(validPatient));
    expect(created.patient_id).toBeTruthy();
    expect(listPatients({ last_name: "O'Neil" })).toHaveLength(1);
    expect(listPatients({ phone_number: "202-555-0147" })[0]?.patient_id).toBe(created.patient_id);
    expect(listPatients({ date_of_birth: "04/12/1990" })[0]?.patient_id).toBe(created.patient_id);

    const updated = updatePatient(created.patient_id, { city: "Arlington", state: "VA" });
    expect(updated.city).toBe("Arlington");
    expect(updated.state).toBe("VA");

    const deleted = softDeletePatient(created.patient_id);
    expect(deleted.deleted_at).toBeTruthy();
    expect(getPatient(created.patient_id)).toBeNull();
    expect(findPatientByPhone("2025550147")).toBeNull();
  });

  it("blocks duplicate phone numbers", () => {
    expect(() =>
      createPatient(
        patientCreateSchema.parse({
          ...validPatient,
          phone_number: "4155550100",
        }),
      ),
    ).toThrow(DuplicatePhoneError);
  });

  it("schedules a mock first appointment", () => {
    const jane = listPatients({ last_name: "Doe" })[0];
    const appointment = scheduleFirstAppointment({
      patient_id: jane.patient_id,
      preferred_date: "2026-09-21",
      preferred_time: "09:30",
      reason: "Follow-up",
    });
    expect(appointment.status).toBe("scheduled");
    expect(appointment.reason).toBe("Follow-up");
  });
});

describe("REST envelope", () => {
  it("lists patients as { data, error }", async () => {
    const response = await getPatients(new NextRequest("http://localhost/patients"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("creates, reads, patches, and soft-deletes over HTTP", async () => {
    const createdRes = await postPatients(
      new Request("http://localhost/patients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validPatient,
          phone_number: "6175550133",
          first_name: "Priya",
          last_name: "Shah",
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json();
    expect(created.error).toBeNull();
    const id = created.data.patient_id as string;

    const got = await getPatientRoute(new Request(`http://localhost/patients/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(got.status).toBe(200);

    const updated = await putPatient(
      new Request(`http://localhost/patients/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ insurance_provider: "Aetna" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.insurance_provider).toBe("Aetna");

    const deleted = await deletePatient(new Request(`http://localhost/patients/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data.deleted_at).toBeTruthy();

    const missing = await getPatientRoute(new Request(`http://localhost/patients/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    expect(missingBody.data).toBeNull();
    expect(missingBody.error.message).toMatch(/not found/i);
  });

  it("returns 422 for invalid payloads", async () => {
    const response = await postPatients(
      new Request("http://localhost/patients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPatient, phone_number: "123" }),
      }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
  });
});
