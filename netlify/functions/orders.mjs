const MENU = Object.freeze({
    coffee: 2000,
    doughnut: 400,
    pancakes: 350,
    puffpuff: 150
});

const PACKAGES = Object.freeze({
    "coffee-break": { savings: 200, minimums: { coffee: 1, doughnut: 1 } },
    "breakfast-two": { savings: 350, minimums: { coffee: 2, doughnut: 2, pancakes: 1 } }
});

const DELIVERY_FEES = Object.freeze({
    academic_area: 600,
    halls_of_residence: 500,
    private_hostel: 300
});
const DELIVERY_AREA_LABELS = Object.freeze({
    academic_area: "Academic area",
    halls_of_residence: "Halls of residence",
    private_hostel: "Private hostel"
});
const MAX_BODY_LENGTH = 12000;
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function reply(status, body) {
    return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isCount(value, max = 50) {
    return Number.isInteger(value) && value >= 0 && value <= max;
}

function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function sendWhatsAppAlert({ order, orderId }) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const recipient = process.env.WHATSAPP_ALERT_TO?.replace(/\D/g, "");
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

    if (!token || !phoneNumberId || !recipient || !graphVersion || !templateName) return "not_configured";
    if (!/^v\d+\.\d+$/.test(graphVersion)) return "failed";

    const itemLabels = {
        coffee: "Coffee",
        doughnut: "Doughnut",
        pancakes: "Pancakes",
        puffpuff: "Puff-Puff"
    };
    const itemSummary = [];
    for (const [item, quantity] of Object.entries(order.items)) {
        if (quantity > 0) itemSummary.push(`${itemLabels[item]} x ${quantity}`);
    }
    const methodSummary = order.fulfilment === "pickup"
        ? `Pick-up; ${itemSummary.join(", ")}`
        : `Delivery to ${DELIVERY_AREA_LABELS[order.delivery_area]} (${order.delivery_address}); ${itemSummary.join(", ")}`;

    try {
        const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: templateLanguage },
                    components: [{
                        type: "body",
                        parameters: [
                            { type: "text", text: orderId },
                            { type: "text", text: order.customer_name },
                            { type: "text", text: order.customer_phone },
                            { type: "text", text: methodSummary.slice(0, 900) },
                            { type: "text", text: `NGN ${order.total.toLocaleString("en-NG")}` }
                        ]
                    }]
                }
            })
        });
        return response.ok ? "sent" : "failed";
    } catch {
        return "failed";
    }
}

export default async function handler(request) {
    if (request.method !== "POST") {
        return reply(405, { error: "Use POST to submit an order." });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_LENGTH) return reply(413, { error: "Order is too large." });

    let payload;
    try {
        const rawBody = await request.text();
        if (rawBody.length > MAX_BODY_LENGTH) return reply(413, { error: "Order is too large." });
        payload = JSON.parse(rawBody);
    } catch {
        return reply(400, { error: "The order data was not valid JSON." });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return reply(400, { error: "The order data must be an object." });
    }

    // Quietly accept bot-trap submissions without storing them.
    if (cleanText(payload.website, 200)) return reply(201, { ok: true });

    const customerName = cleanText(payload.customerName, 100);
    const customerPhone = cleanText(payload.customerPhone, 30);
    const consent = payload.consent === true;
    const fulfilment = payload.fulfilment;
    const deliveryArea = cleanText(payload.deliveryArea, 50);
    const deliveryAddress = cleanText(payload.deliveryAddress, 500);
    const itemKeys = Object.keys(MENU);
    const packageKeys = Object.keys(PACKAGES);

    if (!customerName || !customerPhone || !["pickup", "delivery"].includes(fulfilment)) {
        return reply(400, { error: "Enter your name and phone number, and choose pick-up or delivery." });
    }
    if (!consent) return reply(400, { error: "Please agree to the order details notice before submitting." });
    if (!/^[+\d\s().-]{7,30}$/.test(customerPhone)) {
        return reply(400, { error: "Enter a valid phone number." });
    }
    if (deliveryArea && !Object.hasOwn(DELIVERY_FEES, deliveryArea)) {
        return reply(400, { error: "That delivery area is unavailable. Please choose an available area." });
    }
    if (fulfilment === "delivery" && !deliveryArea) {
        return reply(400, { error: "Choose an available delivery area." });
    }
    if (fulfilment === "delivery" && !deliveryAddress) {
        return reply(400, { error: "Enter a delivery address." });
    }

    const rawItems = payload.items && typeof payload.items === "object" ? payload.items : {};
    const rawPackages = payload.packages && typeof payload.packages === "object" ? payload.packages : {};
    const items = Object.fromEntries(itemKeys.map((key) => [key, rawItems[key] ?? 0]));
    const packages = Object.fromEntries(packageKeys.map((key) => [key, rawPackages[key] ?? 0]));

    if (itemKeys.some((key) => !isCount(items[key])) || packageKeys.some((key) => !isCount(packages[key], 20))) {
        return reply(400, { error: "Item quantities must be whole numbers within the allowed range." });
    }

    for (const [packageName, count] of Object.entries(packages)) {
        for (const [item, perPackage] of Object.entries(PACKAGES[packageName].minimums)) {
            if (items[item] < perPackage * count) {
                return reply(400, { error: "The package quantities don’t match the selected packages. Please review your order." });
            }
        }
    }

    const itemsSubtotal = itemKeys.reduce((sum, key) => sum + MENU[key] * items[key], 0);
    const packageSavings = packageKeys.reduce((sum, key) => sum + PACKAGES[key].savings * packages[key], 0);
    if (itemsSubtotal === 0 || packageSavings > itemsSubtotal) {
        return reply(400, { error: "Add at least one valid menu item." });
    }

    const pickupTotal = itemsSubtotal - packageSavings;
    const selectedDeliveryFee = deliveryArea ? DELIVERY_FEES[deliveryArea] : null;
    const deliveryFee = fulfilment === "delivery" ? selectedDeliveryFee : 0;
    const deliveryTotal = selectedDeliveryFee === null ? null : pickupTotal + selectedDeliveryFee;
    const total = fulfilment === "delivery" ? deliveryTotal : pickupTotal;
    const order = {
        customer_name: customerName,
        customer_phone: customerPhone,
        fulfilment,
        delivery_area: fulfilment === "delivery" ? deliveryArea : null,
        delivery_address: fulfilment === "delivery" ? deliveryAddress : null,
        items,
        packages,
        items_subtotal: itemsSubtotal,
        package_savings: packageSavings,
        delivery_fee: deliveryFee,
        total,
        whatsapp_status: "pending"
    };

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return reply(503, { error: "Order storage is not configured yet. Please try again later." });
    }

    let storedOrder;
    const apiHeaders = {
        apikey: supabaseKey,
        "content-type": "application/json"
    };
    // Legacy service_role keys are JWTs; current sb_secret keys are not.
    if (supabaseKey.startsWith("eyJ")) apiHeaders.authorization = `Bearer ${supabaseKey}`;

    try {
        const saveResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
            method: "POST",
            headers: {
                ...apiHeaders,
                prefer: "return=representation"
            },
            body: JSON.stringify(order)
        });
        if (!saveResponse.ok) return reply(502, { error: "We couldn’t save your order. Please try again." });
        [storedOrder] = await saveResponse.json();
    } catch {
        return reply(502, { error: "We couldn’t reach order storage. Please try again." });
    }

    const whatsappStatus = await sendWhatsAppAlert({ order, orderId: storedOrder.id });
    try {
        await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${storedOrder.id}`, {
            method: "PATCH",
            headers: {
                ...apiHeaders,
                prefer: "return=minimal"
            },
            body: JSON.stringify({ whatsapp_status: whatsappStatus })
        });
    } catch {
        // The saved order remains available even if status bookkeeping fails.
    }

    return reply(201, {
        ok: true,
        orderId: storedOrder.id,
        totals: { itemsSubtotal, packageSavings, pickupTotal, deliveryFee: selectedDeliveryFee, deliveryTotal, total },
        whatsappStatus
    });
}
