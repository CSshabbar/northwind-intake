export const SEX_VALUES = ["Male", "Female", "Other", "Decline to Answer"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export type Patient = {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: Sex;
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PatientFilters = {
  last_name?: string;
  date_of_birth?: string;
  phone_number?: string;
};

export type Appointment = {
  appointment_id: string;
  patient_id: string;
  scheduled_at: string;
  reason: string | null;
  status: "scheduled" | "cancelled" | "completed";
  created_at: string;
};

export type CallRecord = {
  call_id: string;
  patient_id: string | null;
  vapi_call_id: string | null;
  caller_phone: string | null;
  transcript: string | null;
  summary: string | null;
  ended_reason: string | null;
  created_at: string;
};

export type ApiError = {
  message: string;
  code: string;
  details?: unknown;
};

export type ApiEnvelope<T> = {
  data: T;
  error: null;
} | {
  data: null;
  error: ApiError;
};
