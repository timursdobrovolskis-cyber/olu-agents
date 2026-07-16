import { fetchLatestCheckouts } from "@/lib/shopify";
import type { LatestCheckoutsResponse } from "@/lib/types";

export async function GET() {
  try {
    const { checkouts, source } = await fetchLatestCheckouts();
    const body: LatestCheckoutsResponse = { checkouts, source };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
