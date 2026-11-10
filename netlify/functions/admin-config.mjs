export default async function handler(request) {
    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Use GET to load admin settings." }), {
            status: 405,
            headers: { "content-type": "application/json; charset=utf-8" }
        });
    }

    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !publishableKey) {
        return new Response(JSON.stringify({ error: "Admin login is not configured yet." }), {
            status: 503,
            headers: { "content-type": "application/json; charset=utf-8" }
        });
    }

    return new Response(JSON.stringify({ url, publishableKey }), {
        status: 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
        }
    });
}
