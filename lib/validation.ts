import { z } from "zod";
import { normalizePhone } from "./phone";
import { SEX_VALUES, type Sex } from "./types";
import { normalizeState } from "./us-states";

const NAME_RE = /^[\p{L}][\p{L} .'\-]{0,49}$/u;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const MEMBER_ID_RE = /^[A-Za-z0-9\-]+$/;

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function parseMonthDayYear(input: string): { y: number; m: number; d: number } | null {
  const trimmed = input.trim();
  const us = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(trimmed);
  if (us) {
    return { m: Number(us[1]), d: Number(us[2]), y: Number(us[3]) };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }
  return null;
}

export function toIsoDate(input: string): string | null {
  const parts = parseMonthDayYear(input);
  if (!parts) return null;
  const { y, m, d } = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() > todayUtc) return null;
  const ageYears = (todayUtc - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears > 120) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

export function isoToUsDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function normalizeSex(input: string): Sex | null {
  const value = input.trim().toLowerCase();
  if (["male", "m", "man", "hombre", "masculino"].includes(value)) return "Male";
  if (["female", "f", "woman", "mujer", "femenino"].includes(value)) return "Female";
  if (
    ["other", "nonbinary", "non-binary", "non binary", "nb", "otro", "otra"].includes(
      value,
    )
  ) {
    return "Other";
  }
  if (
    [
      "decline to answer",
      "decline",
      "prefer not to say",
      "prefer not to answer",
      "skip",
      "n/a",
      "no answer",
    ].includes(value)
  ) {
    return "Decline to Answer";
  }
  const exact = SEX_VALUES.find((item) => item.toLowerCase() === value);
  return exact ?? null;
}

const nameField = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine((value) => NAME_RE.test(value), {
    message: "Use letters, spaces, hyphens, or apostrophes only (1–50 characters)",
  });

const optionalName = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => NAME_RE.test(value), {
      message: "Use letters, spaces, hyphens, or apostrophes only",
    })
    .optional(),
);

export const patientCreateSchema = z.object({
  first_name: nameField,
  last_name: nameField,
  date_of_birth: z.string().trim().transform((value, ctx) => {
    const iso = toIsoDate(value);
    if (!iso) {
      ctx.addIssue({
        code: "custom",
        message: "Date of birth must be a real date in MM/DD/YYYY format, not in the future",
      });
      return z.NEVER;
    }
    return iso;
  }),
  sex: z.string().trim().transform((value, ctx) => {
    const sex = normalizeSex(value);
    if (!sex) {
      ctx.addIssue({
        code: "custom",
        message: "Sex must be Male, Female, Other, or Decline to Answer",
      });
      return z.NEVER;
    }
    return sex;
  }),
  phone_number: z.string().trim().transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({
        code: "custom",
        message: "Phone number must be a valid U.S. 10-digit number",
      });
      return z.NEVER;
    }
    return phone;
  }),
  email: z.preprocess(
    blankToUndefined,
    z.string().trim().email("Enter a valid email address").max(254).optional(),
  ),
  address_line_1: z.string().trim().min(1).max(120),
  address_line_2: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().transform((value, ctx) => {
    const state = normalizeState(value);
    if (!state) {
      ctx.addIssue({
        code: "custom",
        message: "State must be a valid 2-letter U.S. abbreviation",
      });
      return z.NEVER;
    }
    return state;
  }),
  zip_code: z
    .string()
    .trim()
    .refine((value) => ZIP_RE.test(value), {
      message: "ZIP code must be 5 digits or ZIP+4 (12345 or 12345-6789)",
    }),
  insurance_provider: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  insurance_member_id: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(40)
      .refine((value) => MEMBER_ID_RE.test(value), {
        message: "Insurance member ID must be alphanumeric",
      })
      .optional(),
  ),
  preferred_language: z.preprocess(
    blankToUndefined,
    z.string().trim().max(40).optional(),
  ),
  emergency_contact_name: optionalName,
  emergency_contact_phone: z.preprocess(blankToUndefined, z.string().trim().optional()).transform(
    (value, ctx) => {
      if (value === undefined) return undefined;
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({
          code: "custom",
          message: "Emergency contact phone must be a valid U.S. 10-digit number",
        });
        return z.NEVER;
      }
      return phone;
    },
  ),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

export function formatZodError(error: z.ZodError): { message: string; details: unknown } {
  const details = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const first = details[0];
  return {
    message: first ? `${first.path ? `${first.path}: ` : ""}${first.message}` : "Validation failed",
    details,
  };
}
