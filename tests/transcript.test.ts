import { describe, expect, it } from "vitest";
import { looksLikeEcho, mergeTranscript } from "@/lib/transcript";

describe("call transcript helpers", () => {
  it("treats Avery hearing her own question as echo", () => {
    expect(
      looksLikeEcho(
        "what's your first and last name",
        "Hi, Northwind Family Clinic, this is Avery. What's your first and last name?",
      ),
    ).toBe(true);
  });

  it("keeps a real name answer", () => {
    expect(looksLikeEcho("Alex Chen", "What's your first and last name?")).toBe(false);
  });

  it("appends a new turn instead of replacing a different sentence", () => {
    const next = mergeTranscript(
      [{ role: "avery", text: "What's your first and last name?" }],
      "avery",
      "What's your date of birth?",
    );
    expect(next).toHaveLength(2);
  });
});
