import { NextResponse } from "next/server";
import type { ApiError } from "./types";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null }, { status });
}

export function fail(status: number, message: string, code?: string, details?: unknown) {
  const error: ApiError = {
    message,
    code: code ?? defaultCode(status),
    ...(details !== undefined ? { details } : {}),
  };
  return NextResponse.json({ data: null, error }, { status });
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE_ENTITY";
    default:
      return "INTERNAL_ERROR";
  }
}

export async function readJson(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    const body = await request.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: fail(400, "Request body must be valid JSON", "BAD_JSON"),
    };
  }
}
