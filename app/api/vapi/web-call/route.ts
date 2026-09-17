import { fail, ok } from "@/lib/http";
import { getVapiPublicKey, getWebCallSession } from "@/lib/vapi-public";
import { getLiveConfig } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getWebCallSession();
    return ok(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice demo is not provisioned yet";
    const status = message.includes("not provisioned") ? 503 : 502;
    return fail(status, message, status === 503 ? "NOT_PROVISIONED" : "VAPI_ERROR");
  }
}

export async function POST() {
  const { assistantId } = getLiveConfig();
  if (!process.env.VAPI_API_KEY || !assistantId) {
    return fail(503, "Voice demo is not provisioned yet", "NOT_PROVISIONED");
  }

  try {
    const publicKey = await getVapiPublicKey();
    const response = await fetch("https://api.vapi.ai/call/web", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicKey}`,
        "Content-Type": "application/json",
        "User-Agent": "northwind-intake",
      },
      body: JSON.stringify({ assistantId }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error("[intake] web call failed", response.status);
      return fail(502, "Could not start a browser call with Vapi", "VAPI_ERROR");
    }
    const transport = (body.transport ?? {}) as Record<string, unknown>;
    const webCallUrl =
      (typeof body.webCallUrl === "string" && body.webCallUrl) ||
      (typeof transport.callUrl === "string" && transport.callUrl) ||
      null;
    return ok({
      id: body.id ?? null,
      webCallUrl,
      assistantId,
      publicKey,
    });
  } catch (error) {
    console.error("[intake] web call exception", error);
    return fail(500, "Could not start a browser call");
  }
}
