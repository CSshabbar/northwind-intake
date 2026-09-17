import { getLiveConfig } from "./live";

type VapiToken = {
  tag?: string;
  value?: string;
};

let cachedPublicKey: { value: string; fetchedAt: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function getVapiPublicKey(): Promise<string> {
  if (cachedPublicKey && Date.now() - cachedPublicKey.fetchedAt < CACHE_MS) {
    return cachedPublicKey.value;
  }
  const privateKey = process.env.VAPI_API_KEY;
  if (!privateKey) {
    throw new Error("VAPI_API_KEY is not configured");
  }
  const response = await fetch("https://api.vapi.ai/token", {
    headers: {
      Authorization: `Bearer ${privateKey}`,
      "User-Agent": "northwind-intake",
    },
    cache: "no-store",
  });
  const body = (await response.json()) as VapiToken[] | { message?: string };
  if (!response.ok) {
    throw new Error("Could not load the Vapi public key");
  }
  const tokens = Array.isArray(body) ? body : [];
  const publicToken = tokens.find((token) => token.tag === "public" && token.value);
  if (!publicToken?.value) {
    throw new Error("This Vapi org has no public API key");
  }
  cachedPublicKey = { value: publicToken.value, fetchedAt: Date.now() };
  return publicToken.value;
}

export async function getWebCallSession() {
  const { assistantId, assistantName, phoneNumber } = getLiveConfig();
  if (!assistantId) {
    throw new Error("Voice demo is not provisioned yet");
  }
  const publicKey = await getVapiPublicKey();
  return {
    publicKey,
    assistantId,
    assistantName,
    phoneNumber,
  };
}
