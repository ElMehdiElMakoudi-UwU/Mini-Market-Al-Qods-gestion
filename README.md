# Al Qods Gestion

Point of sale, stock and cash management for **Mini Market Al Qods** (French / Arabic).

- **POS (`/pos`)**: barcode scanning, quick keys, products sold by weight, cash payment with change, 80 mm receipts. Works **offline**: sales are saved on the POS and sent to the server when the connection returns.
- **Cash register (`/cash`)**: opening float, money in/out with a reason, closing count with the difference.
- **Customer credit book / karné (`/customers`)**: customers, balances and full history. At the POS, pick a customer in the payment dialog and whatever isn't paid in cash goes on their karné (works offline too). Repayments go into the open cash register. Old paper balances can be entered when creating a customer. The owner sets credit limits and can correct balances.
- **Products and stock**: products, categories, stock history, low-stock alerts, stock corrections (owner only).
- **Deliveries**: record incoming goods by scanning; stock and purchase prices update automatically.
- **Supplier debts (`/suppliers`)**: what you owe each supplier. When recording a delivery, enter what was paid now (from the drawer, or outside it for the owner); the rest becomes a debt. Pay suppliers later from their page; payments from the drawer count in the closing. Opening debts and corrections are owner only.
- **Owner dashboard (`/dashboard`)**: sales, profit, cash in the drawer, low stock and alerts, viewable from a phone.
- **Accountability**: owner and manager accounts. Only the owner can change prices, correct stock or cancel sales, and every sensitive action is recorded in the activity log.

Stack: Next.js 16, PostgreSQL, Drizzle ORM, Tailwind CSS.

## Local development

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL / OWNER_PASSWORD
npm run db:migrate          # creates tables + the owner account
npm run db:seed             # optional demo products (manager: youssef / 1234)
npm run dev
```

After changing `src/db/schema.ts`, run `npm run db:generate` to create a new migration in `drizzle/`.

## Deploying with Coolify

1. Push this repository to GitHub.
2. In Coolify, create a **PostgreSQL** database resource and copy its internal connection URL.
3. Create a new **Application** from the GitHub repo and choose the **Dockerfile** build pack. Set the port to `3000`.
4. Environment variables:
   - `DATABASE_URL`: the Postgres URL from step 2
   - `OWNER_USERNAME`: e.g. `admin`
   - `OWNER_PASSWORD`: a strong password (only used to create the first account)
   - `OWNER_NAME`: optional display name
5. Set the domain (e.g. `https://caisse.example.com`) and deploy. Migrations run automatically on every start.
6. Enable Coolify's scheduled **database backups** on the Postgres resource.

Then log in as the owner and create the manager account under **Utilisateurs**.

## Setting up the shop POS (Windows)

1. Install **Windows 10/11** and **Google Chrome**.
2. Open `https://<your-domain>/pos`, log in with the manager account, and use Chrome's menu → *Cast, save and share* → **Install page as app**. This gives a full-screen app that opens even without internet.
3. **Barcode scanner:** USB scanners act as a keyboard. Configure the scanner to send **Enter** after each code (the default for most models).
4. **Receipt printer:** install the printer's Windows driver, set it as the **default printer**, and in the print dialog choose paper 80 mm with margins "None" once.
   For printing without the dialog, start Chrome with `--kiosk-printing`, e.g. a desktop shortcut:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://<your-domain>/pos
   ```
5. Keep the POS open during the day. If the connection drops, keep selling: the header shows **Hors ligne** and the number of sales waiting, and they upload automatically.
   The register can only be closed once all sales have been uploaded.
