const STATUS_LABELS = {
    new: "New",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled"
};
const ITEM_LABELS = {
    coffee: "Coffee",
    doughnut: "Doughnut",
    pancakes: "Pancakes",
    puffpuff: "Puff-Puff"
};
const AREA_LABELS = {
    academic_area: "Academic area",
    halls_of_residence: "Halls of residence",
    private_hostel: "Private hostel"
};
const PACKAGE_LABELS = {
    "coffee-break": "Coffee Break",
    "breakfast-two": "Breakfast for Two"
};
const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
});
const loginPanel = document.getElementById("login-panel");
const loginForm = document.getElementById("login-form");
const ordersPanel = document.getElementById("orders-panel");
const loginMessage = document.getElementById("login-message");
const ordersMessage = document.getElementById("orders-message");
const ordersBody = document.getElementById("orders-body");
const emptyState = document.getElementById("empty-state");
let config;
let accessToken = sessionStorage.getItem("brewBitesAdminToken");

function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
}

function textCell(value, className = "") {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value;
    return cell;
}

function describeItems(items = {}, packages = {}) {
    const itemSummary = Object.entries(items)
        .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
        .map(([item, quantity]) => `${ITEM_LABELS[item] || item} × ${quantity}`)
        .join(", ");
    const packageSummary = Object.entries(packages)
        .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
        .map(([name, quantity]) => `${PACKAGE_LABELS[name] || name} package × ${quantity}`)
        .join(", ");
    return [packageSummary, itemSummary].filter(Boolean).join(" · ");
}

function makeStatusSelect(order) {
    const select = document.createElement("select");
    select.className = "order-status-select";
    select.setAttribute("aria-label", `Status for order ${order.id}`);
    for (const [value, label] of Object.entries(STATUS_LABELS)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = order.status === value;
        select.append(option);
    }
    select.addEventListener("change", () => updateStatus(order.id, select));
    const cell = document.createElement("td");
    cell.append(select);
    return cell;
}

function renderOrders(orders) {
    ordersBody.replaceChildren();
    emptyState.hidden = orders.length !== 0;

    for (const order of orders) {
        const row = document.createElement("tr");
        const date = new Date(order.created_at);
        const orderCell = document.createElement("td");
        const dateLine = document.createElement("div");
        dateLine.textContent = Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG");
        const idLine = document.createElement("div");
        idLine.className = "order-id";
        idLine.textContent = order.id;
        orderCell.append(dateLine, idLine);

        const fulfilment = order.fulfilment === "delivery" ? "Delivery" : "Pick-up";
        const destination = order.fulfilment === "delivery"
            ? `${AREA_LABELS[order.delivery_area] || "Area unavailable"}: ${order.delivery_address || "No address"}`
            : "Collect at shop";
        const fulfilmentCell = document.createElement("td");
        const method = document.createElement("div");
        method.textContent = fulfilment;
        const address = document.createElement("div");
        address.className = "muted";
        address.textContent = destination;
        fulfilmentCell.append(method, address);

        const customerCell = document.createElement("td");
        const name = document.createElement("div");
        name.textContent = order.customer_name || "—";
        const phone = document.createElement("div");
        phone.textContent = order.customer_phone || "—";
        customerCell.append(name, phone);

        row.append(
            orderCell,
            customerCell,
            textCell(describeItems(order.items, order.packages), "order-items"),
            fulfilmentCell,
            textCell(money.format(Number(order.total) || 0)),
            makeStatusSelect(order),
            textCell(order.whatsapp_status || "Not configured")
        );
        ordersBody.append(row);
    }
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            authorization: `Bearer ${accessToken}`
        },
        cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
}

async function loadOrders() {
    setMessage(ordersMessage, "Loading orders…");
    try {
        const result = await api("/.netlify/functions/admin-orders");
        renderOrders(result.orders || []);
        setMessage(ordersMessage, `${(result.orders || []).length} recent order(s).`);
    } catch (error) {
        if (/session has expired|authorized admin/i.test(error.message)) {
            signOut(false);
            setMessage(loginMessage, error.message, true);
            return;
        }
        setMessage(ordersMessage, error.message, true);
    }
}

async function updateStatus(orderId, select) {
    const previousStatus = select.value;
    select.disabled = true;
    setMessage(ordersMessage, "Updating order status…");
    try {
        await api("/.netlify/functions/admin-orders", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId, status: previousStatus })
        });
        setMessage(ordersMessage, `Order status changed to ${STATUS_LABELS[previousStatus]}.`);
    } catch (error) {
        setMessage(ordersMessage, error.message, true);
        await loadOrders();
    } finally {
        select.disabled = false;
    }
}

async function showOrders() {
    loginPanel.hidden = true;
    ordersPanel.hidden = false;
    await loadOrders();
}

function signOut(showNotice = true) {
    accessToken = null;
    sessionStorage.removeItem("brewBitesAdminToken");
    ordersPanel.hidden = true;
    loginPanel.hidden = false;
    if (showNotice) setMessage(loginMessage, "You have signed out.");
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("login-button");
    button.disabled = true;
    setMessage(loginMessage, "Signing in…");

    try {
        if (!config) throw new Error("Admin settings are unavailable. Reload this page after setup.");
        const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
                apikey: config.publishableKey,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                email: document.getElementById("admin-email").value.trim(),
                password: document.getElementById("admin-password").value
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.access_token) throw new Error(result.msg || result.message || "Sign-in failed. Check your email and password.");

        accessToken = result.access_token;
        sessionStorage.setItem("brewBitesAdminToken", accessToken);
        await showOrders();
    } catch (error) {
        signOut(false);
        setMessage(loginMessage, error.message, true);
    } finally {
        button.disabled = false;
    }
});

document.getElementById("refresh-orders").addEventListener("click", loadOrders);
document.getElementById("sign-out").addEventListener("click", () => signOut());

(async function initializeAdmin() {
    try {
        const response = await fetch("/.netlify/functions/admin-config", { cache: "no-store" });
        config = await response.json();
        if (!response.ok) throw new Error(config.error || "Admin login is not configured yet.");
        if (accessToken) await showOrders();
    } catch (error) {
        setMessage(loginMessage, error.message, true);
    }
})();
