import { NextRequest } from "next/server";
import { getEntriesForHost } from "@/lib/history";

export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host");
  if (!host) {
    return Response.json({ error: "Missing 'host' query parameter" }, { status: 400 });
  }
  return Response.json({ entries: getEntriesForHost(host) });
}
