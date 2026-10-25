import { NextRequest } from "next/server";
import { scanSite } from "@/lib/scanner";

export async function GET(request: NextRequest) {
  const a = request.nextUrl.searchParams.get("a");
  const b = request.nextUrl.searchParams.get("b");
  if (!a || !b) {
    return Response.json({ error: "Both 'a' and 'b' query parameters are required" }, { status: 400 });
  }
  try {
    const [resultA, resultB] = await Promise.all([scanSite(a, false), scanSite(b, false)]);
    return Response.json({ a: resultA, b: resultB });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compare failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
