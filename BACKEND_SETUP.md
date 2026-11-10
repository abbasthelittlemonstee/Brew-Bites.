# Brew & Bites order backend

The order form posts to a Netlify Function. The function validates quantities, checks package contents and availability, recalculates prices on the server, and inserts each order into Supabase. Order rows are not readable by public visitors. Delivery fees are Academic area **₦600**, Halls of residence **₦500**, and Private hostel **₦300**. Off-campus is unavailable. These fees are defined in both `Brew&Bites.js` and `netlify/functions/orders.mjs`; keep them aligned when prices change.

## 1. Create the orders table

1. Create a Supabase project.
2. Open **SQL Editor → New query**.
3. Paste and run the contents of `supabase/orders.sql`.
4. In **Project Settings → API**, copy the Project URL, the public **Publishable key** (`sb_publishable_...`), and a server-side **Secret key** (`sb_secret_...`). A legacy `service_role` key also works.

Never put the Supabase secret key in browser JavaScript or commit it to GitHub.

## 2. Deploy on Netlify

1. Import the GitHub repository into Netlify and deploy from `main`.
2. Keep the site base directory at the repository root. `netlify.toml` sets the static publish directory to `.` and the function directory to `netlify/functions`.
3. In Netlify, open **Project configuration → Environment variables** and add:

   - `SUPABASE_URL` — the Supabase Project URL.
   - `SUPABASE_SECRET_KEY` — the Supabase server-side secret key (or use `SUPABASE_SERVICE_ROLE_KEY` for a legacy key).
   - `SUPABASE_PUBLISHABLE_KEY` — the public key used for admin sign-in (or use `SUPABASE_ANON_KEY` for a legacy key).
   - `ADMIN_EMAIL` — the exact email address allowed to manage orders.

   Set these in Netlify’s UI with the **Functions** scope. Then redeploy so the function receives them.

4. Submit a small test order. Confirm it appears in Supabase under **Table Editor → orders**. The order endpoint is `/.netlify/functions/orders`.

## 3. Set up the admin area

1. In Supabase, open **Authentication → Users** and create an email/password user for the person who will manage orders. Confirm the email if the project requires it.
2. Set `ADMIN_EMAIL` in Netlify to the same email address. Only this email is allowed through the admin API.
3. Visit `https://your-site.netlify.app/admin/` (replace with your Netlify site URL) and sign in with that Supabase user's email and password.
4. The dashboard shows up to 100 recent orders and lets the admin change each order status. Each dashboard request is checked on the server before the secret database key is used.

The admin page can load before these settings exist, but sign-in and order access will remain unavailable until they are configured and the site is redeployed.

## 4. Enable WhatsApp order alerts

Automatic alerts use the WhatsApp Business Platform Cloud API. This requires a Meta business/app setup, a registered sending phone number, an access token, and an approved message template. Meta’s API requires creating a template before sending template messages: [Meta’s template message reference](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text).

Create an approved utility template with this body and five text placeholders in order:

```text
New Brew & Bites order {{1}}.
Customer: {{2}}
Phone: {{3}}
Details: {{4}}
Total: {{5}}
```

Add these values as Netlify environment variables (Functions scope), then redeploy:

- `WHATSAPP_ACCESS_TOKEN` — Meta access token.
- `WHATSAPP_PHONE_NUMBER_ID` — ID for the WhatsApp sending number.
- `WHATSAPP_ALERT_TO` — the manager’s recipient number in international format, digits only (for example `2348012345678`).
- `WHATSAPP_GRAPH_VERSION` — the current version shown in Meta’s API setup.
- `WHATSAPP_TEMPLATE_NAME` — the approved template’s exact name.
- `WHATSAPP_TEMPLATE_LANGUAGE` — the template language code, such as `en`.

Keep every token out of the repository. If WhatsApp is not configured or an alert fails, the order is still saved and the customer gets a link to send the order through the site’s WhatsApp chat.

## Order details stored

Orders include the customer’s name and phone, fulfilment method, delivery address when applicable, item/package quantities, calculated totals, and WhatsApp alert status. The form asks customers to agree to storage and use of these details for order processing. Review local privacy requirements and decide how long to retain order records before opening the site to customers.
