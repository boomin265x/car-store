# Auto Customs storefront

## Start the local backend

This project uses Node.js 20 or newer and has no npm package dependencies. Copy `.env.example` to `.env`, fill in your Supabase project URL and **service-role key**, and choose a strong admin password. Keep `.env` private; it is ignored by Git. The service-role key must only be used by this local server, never in browser code.

Create a free Supabase project without enabling paid add-ons. In its SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) to create and seed the `public.products` table. In Project Settings → API Keys, copy the project URL and service-role key into `.env`.

Then run:

```powershell
npm start
```

Open <http://localhost:3000>. The health endpoint at <http://localhost:3000/api/health> reports whether the required settings are present. Inventory is read from Supabase; add/delete actions require the admin credentials from `.env`.

Supabase Free has usage limits; review the current Supabase plan and do not enable billing or paid add-ons if you need to avoid charges.

## Deploy on Render

The [`render.yaml`](./render.yaml) Blueprint configures this app as a Node web service. Push the project to a GitHub repository, then create a Blueprint in Render and select that repository. Before the first deploy, provide these environment variables in Render:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Keep the service-role key in Render's environment settings only; never put it in browser code or commit `.env`. After deployment, `/api/health` should report `ready`.

The Blueprint currently uses Render's Free web-service plan. Free services sleep after 15 minutes without traffic and can take about a minute to wake, so this is suitable for a preview or hobby launch rather than a production storefront. See [Render's free-service limits](https://render.com/docs/free).

## Orders

Checkout orders are saved to the `orders` and `order_items` tables by the server-side `create_order` database function. The function recalculates prices from inventory and reserves the requested stock in one transaction. New orders start with `pending` status. Checkout records the selected payment method but does not charge a customer or send an order notification.

If Supabase was set up before order support was added, run the updated [`supabase/schema.sql`](./supabase/schema.sql) in the SQL Editor to add the order tables and function. The script is safe to rerun for the existing seeded products.
