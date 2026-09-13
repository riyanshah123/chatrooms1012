// Lightweight liveness endpoint for the host's health check. Deliberately does
// NOT call the API, so the web service reports healthy independent of the API.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
