const ALLOWED_STATUSES = new Set([
    "new",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "cancelled"
]);

const RESPONSE_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
};

function reply(status, body) {
    return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

async function authenticateAdmin(request) {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    if (!token || !supabaseUrl || !publishableKey || !allowedEmail) {
        return { error: reply(401, { error: "Sign in with an authorized admin account." }) };
    }

    try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                apikey: publishableKey,
                authorization: `Bearer ${token}`
            }
        });
        if (!response.ok) return { error: reply(401, { error: "Your session has expired. Please sign in again." }) };

        const user = await response.json();
        if (typeof user.email !== "string" || user.email.toLowerCase() !== allowedEmail) {
            return { error: reply(403, { error: "This account is not authorized to access order management." }) };
        }

        return { user };
    } catch {
        return { error: reply(502, { error: "Could not verify the admin session." }) };
    }
}

export default async function handler(request) {
    if (!["GET", "PATCH"].includes(request.method)) {
        return reply(405, { error: "Use GET to view orders or PATCH to update an order." });
    }

    const auth = await authenticateAdmin(request);
    if (auth.error) return auth.error;

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) return reply(503, { error: "Order access is not configured yet." });

    const headers = {
        apikey: supabaseKey,
        "content-type": "application/json"
    };
    if (supabaseKey.startsWith("eyJ")) headers.authorization = `Bearer ${supabaseKey}`;

    if (request.method === "GET") {
        const query = new URLSearchParams({
            select: "id,created_at,customer_name,customer_phone,fulfilment,delivery_area,delivery_address,items,packages,items_subtotal,package_savings,delivery_fee,total,status,whatsapp_status",
            order: "created_at.desc",
            limit: "100"
        });
        try {
            const response = await fetch(`${supabaseUrl}/rest/v1/orders?${query}`, { headers });
            if (!response.ok) return reply(502, { error: "Could not load orders from storage." });
            return reply(200, { orders: await response.json() });
        } catch {
            return reply(502, { error: "Could not reach order storage." });
        }
    }

    let payload;
    try {
        payload = await request.json();
    } catch {
        return reply(400, { error: "The update request was not valid JSON." });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return reply(400, { error: "The update request must be an object." });
    }

    const orderId = typeof payload.orderId === "string" ? payload.orderId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
        return reply(400, { error: "Choose a valid order." });
    }
    if (!ALLOWED_STATUSES.has(payload.status)) return reply(400, { error: "Choose a valid order status." });

    const query = new URLSearchParams({
        id: `eq.${orderId}`,
        select: "id,status"
    });
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/orders?${query}`, {
            method: "PATCH",
            headers: { ...headers, prefer: "return=representation" },
            body: JSON.stringify({ status: payload.status })
        });
        if (!response.ok) return reply(502, { error: "Could not update the order." });
        const [updatedOrder] = await response.json();
        if (!updatedOrder) return reply(404, { error: "Order not found." });
        return reply(200, { ok: true, order: updatedOrder });
    } catch {
        return reply(502, { error: "Could not reach order storage." });
    }
}
