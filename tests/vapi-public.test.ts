import { afterEach, describe, expect, it, vi } from "vitest";

describe("getVapiPublicKey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("selects the public token from GET /token", async () => {
    vi.stubEnv("VAPI_API_KEY", "private-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        expect(url).toBe("https://api.vapi.ai/token");
        return new Response(
          JSON.stringify([
            { tag: "private", value: "priv-aaaa" },
            { tag: "public", value: "pub-bbbb" },
          ]),
          { status: 200 },
        );
      }),
    );
    const { getVapiPublicKey } = await import("../lib/vapi-public");
    await expect(getVapiPublicKey()).resolves.toBe("pub-bbbb");
  });
});
