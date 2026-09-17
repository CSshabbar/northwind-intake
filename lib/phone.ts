/** Normalize a US phone number to 10 digits. Accepts +1, punctuation, and spoken grouping. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  if (ten[0] === "0" || ten[0] === "1") return null;
  return ten;
}

export function formatPhone(tenDigits: string): string {
  const digits = normalizePhone(tenDigits) ?? tenDigits.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return tenDigits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatDialable(phone: string | null | undefined): string {
  if (!phone) return "Provisioning…";
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return phone;
  return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
