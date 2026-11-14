import type { NextRequest } from "next/server";

/**
 * The request's JSON body, or `null` when it isn't valid JSON. Routes validate
 * the result with Zod, so a malformed body becomes the same 400 as a
 * well-formed but invalid one, instead of a SyntaxError surfacing as a 500.
 */
export async function readJsonBody(request: NextRequest | Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
