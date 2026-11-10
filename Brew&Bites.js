const prices = {
    coffee: 2000,
    doughnut: 400,
    pancakes: 350,
    puffpuff: 150
};

// Keep these fees aligned with DELIVERY_FEES in netlify/functions/orders.mjs.
const deliveryFees = {
    academic_area: 600,
    halls_of_residence: 500,
    private_hostel: 300
};
const packageSavings = {
    "coffee-break": 200,
    "breakfast-two": 350
};
const packageCounts = {
    "coffee-break": 0,
    "breakfast-two": 0
};
const itemNames = {
    coffee: "Freshly brewed coffee",
    doughnut: "Doughnut",
    pancakes: "Pancakes",
    puffpuff: "Puff-Puff"
};
const currency = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
});

const orderForm = document.getElementById("order-form");
const quantityInputs = document.querySelectorAll("[data-item]");
const deliveryFields = document.getElementById("delivery-fields");
const deliveryAddress = document.getElementById("delivery-address");
const deliveryArea = document.getElementById("delivery-area");
const customerName = document.getElementById("customer-name");
const customerPhone = document.getElementById("customer-phone");
const orderStatus = document.getElementById("order-status");
const submitButton = document.getElementById("submit-order");
const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");

function closeNavigation() {
    navbar.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation menu");
}

navToggle.addEventListener("click", () => {
    const isOpen = navbar.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
});

document.querySelectorAll(".nav-menu a").forEach((link) => {
    link.addEventListener("click", closeNavigation);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
});

function quantities() {
    return Object.fromEntries(Array.from(quantityInputs, (input) => [
        input.dataset.item,
        Math.max(0, Number.parseInt(input.value, 10) || 0)
    ]));
}

function totals() {
    const amount = quantities();
    const subtotal = Object.entries(prices).reduce(
        (sum, [item, price]) => sum + price * amount[item],
        0
    );
    const savings = Object.entries(packageSavings).reduce(
        (sum, [name, saving]) => sum + saving * packageCounts[name],
        0
    );
    const discountedSubtotal = Math.max(0, subtotal - savings);
    const selectedDeliveryFee = deliveryFees[deliveryArea.value] ?? null;

    return {
        amount,
        subtotal,
        savings,
        pickup: discountedSubtotal,
        deliveryFee: selectedDeliveryFee,
        delivery: selectedDeliveryFee === null ? null : discountedSubtotal + selectedDeliveryFee
    };
}

function updateTotals() {
    const current = totals();
    document.getElementById("items-total").textContent = currency.format(current.subtotal);
    document.getElementById("savings-total").textContent = `−${currency.format(current.savings)}`;
    document.getElementById("pickup-total").textContent = currency.format(current.pickup);
    document.getElementById("delivery-fee-total").textContent = current.deliveryFee === null ? "Select an area" : currency.format(current.deliveryFee);
    document.getElementById("delivery-total").textContent = current.delivery === null ? "Select an area" : currency.format(current.delivery);
}

function setDeliveryVisibility() {
    const deliverySelected = document.querySelector('input[name="fulfilment"]:checked').value === "delivery";
    deliveryFields.hidden = !deliverySelected;
    deliveryArea.required = deliverySelected;
    deliveryAddress.required = deliverySelected;
}

function orderLines(serverTotals = totals()) {
    const lines = ["BREW & BITES ORDER", "=================="];
    Object.entries(serverTotals.amount || serverTotals.items).forEach(([item, quantity]) => {
        if (quantity > 0) lines.push(`${itemNames[item]} x ${quantity}`);
    });
    lines.push("", `Items subtotal: ${currency.format(serverTotals.subtotal ?? serverTotals.itemsSubtotal)}`);
    lines.push(`Package savings: -${currency.format(serverTotals.savings ?? serverTotals.packageSavings)}`);
    lines.push(`Pick-up total: ${currency.format(serverTotals.pickup ?? ((serverTotals.subtotal ?? serverTotals.itemsSubtotal) - (serverTotals.savings ?? serverTotals.packageSavings)))}`);
    if (serverTotals.deliveryFee !== null && serverTotals.deliveryFee !== undefined) {
        lines.push(`Delivery fee: ${currency.format(serverTotals.deliveryFee)}`);
        lines.push(`Delivery total: ${currency.format(serverTotals.delivery ?? serverTotals.deliveryTotal)}`);
    } else {
        lines.push("Delivery fee: Choose an area to calculate");
        lines.push("Delivery total: Choose an area to calculate");
    }
    lines.push(`Customer: ${customerName.value.trim()}`, `Phone: ${customerPhone.value.trim()}`);

    const fulfilment = document.querySelector('input[name="fulfilment"]:checked').value;
    lines.push(`Selected method: ${fulfilment === "pickup" ? "Pick-up" : "Delivery"}`);
    if (fulfilment === "delivery") lines.push(`Address: ${deliveryAddress.value.trim()}`);
    if (fulfilment === "delivery") lines.push(`Delivery area: ${deliveryArea.options[deliveryArea.selectedIndex].text.split(" — ")[0]}`);
    lines.push("", "Please contact Brew & Bites to confirm availability and payment.");
    return lines;
}

function downloadOrder(lines) {
    const file = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brew-and-bites-order.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showWhatsAppFallback(lines) {
    const message = lines.join("\n");
    const url = `https://wa.me/2349023709091?text=${encodeURIComponent(message)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "whatsapp-fallback";
    link.textContent = "Send a copy to Brew & Bites on WhatsApp";
    orderStatus.append(document.createTextNode("Automatic WhatsApp alert isn’t configured yet. "), link);
}

quantityInputs.forEach((input) => input.addEventListener("input", updateTotals));
document.querySelectorAll('input[name="fulfilment"]').forEach((input) => {
    input.addEventListener("change", setDeliveryVisibility);
});
deliveryArea.addEventListener("change", updateTotals);

document.querySelectorAll("[data-package]").forEach((button) => {
    button.addEventListener("click", () => {
        const name = button.dataset.package;
        const additions = name === "coffee-break"
            ? { coffee: 1, doughnut: 1 }
            : { coffee: 2, doughnut: 2, pancakes: 1 };

        quantityInputs.forEach((input) => {
            input.value = (Number.parseInt(input.value, 10) || 0) + (additions[input.dataset.item] || 0);
        });
        packageCounts[name] += 1;
        updateTotals();
        orderForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });
});

orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = totals();
    if (!Object.values(current.amount).some((quantity) => quantity > 0)) {
        orderStatus.textContent = "Please add at least one item or package.";
        return;
    }

    const fulfilment = document.querySelector('input[name="fulfilment"]:checked').value;
    const expectedTotal = fulfilment === "pickup" ? current.pickup : current.delivery;
    if (fulfilment === "delivery" && current.delivery === null) {
        orderStatus.textContent = "Choose an available delivery area before submitting.";
        deliveryArea.focus();
        return;
    }
    if (!window.confirm(`Submit your order and download a copy?\n\nSelected method: ${fulfilment}\nEstimated total: ${currency.format(expectedTotal)}`)) {
        return;
    }

    orderStatus.textContent = "Submitting your order…";
    submitButton.disabled = true;

    try {
        const response = await fetch("/.netlify/functions/orders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                customerName: customerName.value.trim(),
                customerPhone: customerPhone.value.trim(),
                consent: document.getElementById("order-consent").checked,
                fulfilment,
                deliveryArea: deliveryArea.value,
                deliveryAddress: fulfilment === "delivery" ? deliveryAddress.value.trim() : "",
                items: current.amount,
                packages: { ...packageCounts },
                website: document.getElementById("website").value
            })
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "We couldn’t submit your order.");

        const verifiedTotals = {
            amount: current.amount,
            subtotal: result.totals.itemsSubtotal,
            savings: result.totals.packageSavings,
            pickup: result.totals.pickupTotal,
            deliveryFee: result.totals.deliveryFee,
            delivery: result.totals.deliveryTotal
        };
        updateTotals();
        const lines = orderLines(verifiedTotals);
        downloadOrder(lines);

        if (result.whatsappStatus === "sent") {
            orderStatus.textContent = `Order ${result.orderId} received and WhatsApp alert sent. Your summary is downloading.`;
        } else {
            orderStatus.textContent = `Order ${result.orderId} saved. Your summary is downloading. `;
            showWhatsAppFallback(lines);
        }
    } catch (error) {
        orderStatus.textContent = error.message || "Something went wrong. Please try again.";
    } finally {
        submitButton.disabled = false;
    }
});

setDeliveryVisibility();
updateTotals();
