const prices = {
    coffee: 2000,
    doughnut: 400,
    pancakes: 350,
    puffpuff: 150
};

// Change this sample amount to the actual delivery fee before publishing.
const deliveryFee = 1500;
const packageSavings = {
    "coffee-break": 200,
    "breakfast-two": 350
};
const packageCounts = {
    "coffee-break": 0,
    "breakfast-two": 0
};
const currency = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
});

const quantityInputs = document.querySelectorAll("[data-item]");
const deliveryFields = document.getElementById("delivery-fields");
const deliveryAddress = document.getElementById("delivery-address");
const customerPhone = document.getElementById("customer-phone");

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

    return { amount, subtotal, savings, pickup: discountedSubtotal, delivery: discountedSubtotal + deliveryFee };
}

function updateTotals() {
    const current = totals();
    document.getElementById("items-total").textContent = currency.format(current.subtotal);
    document.getElementById("savings-total").textContent = `−${currency.format(current.savings)}`;
    document.getElementById("pickup-total").textContent = currency.format(current.pickup);
    document.getElementById("delivery-total").textContent = currency.format(current.delivery);
}

function setDeliveryVisibility() {
    const deliverySelected = document.querySelector('input[name="fulfilment"]:checked').value === "delivery";
    deliveryFields.hidden = !deliverySelected;
    deliveryAddress.required = deliverySelected;
    customerPhone.required = deliverySelected;
}

quantityInputs.forEach((input) => input.addEventListener("input", updateTotals));
document.querySelectorAll('input[name="fulfilment"]').forEach((input) => {
    input.addEventListener("change", setDeliveryVisibility);
});

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
        document.getElementById("order-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });
});

document.getElementById("download-order").addEventListener("click", () => {
    const current = totals();
    const hasItems = Object.values(current.amount).some((quantity) => quantity > 0);
    if (!hasItems) {
        window.alert("Please add at least one item or package to your order.");
        return;
    }

    const fulfilment = document.querySelector('input[name="fulfilment"]:checked').value;
    const address = deliveryAddress.value.trim();
    const phone = customerPhone.value.trim();
    if (fulfilment === "delivery" && (!address || !phone)) {
        window.alert("Please enter your delivery address and phone number.");
        return;
    }

    const itemNames = {
        coffee: "Freshly brewed coffee",
        doughnut: "Doughnut",
        pancakes: "Pancakes",
        puffpuff: "Puff-Puff"
    };
    const lines = ["BREW & BITES ORDER", "=================="];
    Object.entries(current.amount).forEach(([item, quantity]) => {
        if (quantity > 0) lines.push(`${itemNames[item]} x ${quantity}`);
    });
    lines.push("", `Items subtotal: ${currency.format(current.subtotal)}`);
    lines.push(`Package savings: -${currency.format(current.savings)}`);
    lines.push(`Pick-up total: ${currency.format(current.pickup)}`);
    lines.push(`Delivery total: ${currency.format(current.delivery)} (includes ${currency.format(deliveryFee)} sample fee)`);
    lines.push(`Selected method: ${fulfilment === "pickup" ? "Pick-up" : "Delivery"}`);
    if (fulfilment === "delivery") {
        lines.push(`Address: ${address}`, `Phone: ${phone}`);
    }
    lines.push("", "Please contact Brew & Bites to confirm availability and payment.");

    if (!window.confirm(`Download your order summary?\n\nSelected method: ${fulfilment}\nTotal: ${currency.format(fulfilment === "pickup" ? current.pickup : current.delivery)}`)) {
        return;
    }

    const file = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brew-and-bites-order.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

setDeliveryVisibility();
updateTotals();
