import fs from "node:fs";
import path from "node:path";

export type LiveConfig = {
  phoneNumber: string | null;
  publicApiUrl: string | null;
  assistantId: string | null;
  assistantName: string;
};

const DEFAULT_CONFIG: LiveConfig = {
  phoneNumber: process.env.NEXT_PUBLIC_INTAKE_PHONE ?? null,
  publicApiUrl: process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? null,
  assistantId: process.env.VAPI_ASSISTANT_ID ?? null,
  assistantName: "Avery — Northwind Intake",
};

export function getLiveConfig(): LiveConfig {
  const livePath = path.join(process.cwd(), "data", "live.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(livePath, "utf8")) as Partial<LiveConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      phoneNumber: parsed.phoneNumber ?? DEFAULT_CONFIG.phoneNumber,
      publicApiUrl: parsed.publicApiUrl ?? DEFAULT_CONFIG.publicApiUrl,
      assistantId: parsed.assistantId ?? DEFAULT_CONFIG.assistantId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
