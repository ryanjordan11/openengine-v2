import { NextRequest } from "next/server";
import { scanSite } from "@/lib/scanner";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const crawl = request.nextUrl.searchParams.get("crawl") === "true";

  if (!url || url.trim().length === 0) {
    return Response.json({ error: "Missing 'url' query parameter" }, { status: 400 });
  }
  if (url.length > 2048) {
    return Response.json({ error: "URL too long" }, { status: 400 });
  }

  try {
    const result = await scanSite(url, crawl);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
