export const dynamic = "force-dynamic";

export function GET() {
  const launch = process.env.PLANIMETRIKA_RELEASE_LAUNCH;
  return new Response(launch ?? "", {
    status: launch ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
