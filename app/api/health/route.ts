import { ok } from "@/lib/http";
import { getLiveConfig } from "@/lib/live";
import { formatDialable } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    status: "ok",
    service: "northwind-intake",
    ...getLiveConfig(),
    dialable: formatDialable(getLiveConfig().phoneNumber),
  });
}
