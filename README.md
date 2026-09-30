# ShopLab

A local e-commerce application and web security assessment portfolio. React + Express + PostgreSQL + Prisma, with reproducible development data and authorization/business-logic regression tests.

**Status:** assessment parts 1–8 are documented in the [consolidated report](C:/Users/ADMIN/Desktop/pentest/reports/SL-PT-20260925/ShopLab_BaoCaoTongHop_Phan1_Den8.docx). Findings have not been retested after fixes. The complete assessment folder, including reports and evidence, is now at `C:\Users\ADMIN\Desktop\pentest`.

## Workspace cleanup and data reset — 2026-09-30

The local development and test databases, uploaded files, assessment database backups, temporary document renders and frontend build output were removed. A fresh local development database was created using the current migrations and original seed: 6 demo accounts, 20 products, 15 reviews, 5 coupons, 10 sample orders and 5 sample support tickets. Sessions, tokens, cart items, uploaded files and audit records are empty. This is the original demo dataset, not an empty storefront. Application source was preserved; this reset does not fix the findings in the historical report.

Keep `frontend/`, `backend/`, `scripts/`, `lab/`, `infra/`, dependency manifests and lockfile to run/build the project. `node_modules/` contains installed dependencies; `.local/` contains the local database and credentials. Assessment materials have been moved to the Desktop. Assessment scripts may need their workspace-relative paths updated before reuse from the new location. The separate Bookverse document is retained in `docs/personal/`. Optional project Markdown documents have been removed; this README remains the main guide.

Start the app with `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1`. If an existing browser tab still displays old state, reload it and sign in again.

## Run locally without Docker

Requirements: Node.js 24 and pnpm 11.19.0. The first install downloads the PostgreSQL binaries for your platform. No existing PostgreSQL installation is needed.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173**. Password-reset inbox: **http://localhost:8025**. Use `localhost` consistently; the refresh Origin check expects this hostname, not `127.0.0.1`.

The runner creates credentials in ignored `.local/settings.json`, starts PostgreSQL on loopback port 55432, applies migrations, seeds data, starts the API on 4000, fixtures on 4101/4102, SMTP on 1025, and Vite on 5173. Press Ctrl+C to stop services. Re-running does not overwrite accounts or reset your orders.

On this Windows host, if `pnpm` or `node` is not in PATH, use the launcher below. It locates the bundled runtime and sets PATH only for the launched process; it does not change system settings.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

## Demo accounts

| Email | Role |
|---|---|
| admin@shoplab.local | Admin |
| user1@shoplab.local | User A |
| user2@shoplab.local | User B |

Local-only password: `Password123!`. `user3` and `user4` also exist; `user5` is disabled to exercise account-state handling. `WELCOME10` is a seeded one-use-per-user coupon. These credentials are for the local educational environment only.

## Docker Compose

Docker Desktop with Linux containers must be installed and running. The current Windows host does not have Docker, so Compose runtime verification remains outstanding.

```powershell
powershell -File scripts/setup.ps1
docker compose up --build
```

Open http://localhost:8080; Mailpit at http://localhost:8025. Stop the local Node runner first because both use inbox ports. Compose publishes no database/API ports and uses an internal network. The backend migrates and seeds on start. To stop while retaining data: `docker compose down`.

Image import: `http://image-source:4101/sample.png` in Compose, or `http://127.0.0.1:4101/sample.png` in local Node development. Other origins and redirects are rejected in the baseline.

## Tests and build

```powershell
pnpm test
pnpm test:ui
pnpm build
powershell -File scripts/smoke.ps1
```

`pnpm test` starts a separate real PostgreSQL cluster on 55433, creates a fresh test database, deploys migrations, runs Jest/Supertest, then drops only that test database. It never points at your development database. Do not run two test runners concurrently on the same ports.

Integration coverage includes cross-user resource access, role enforcement, checkout retries, concurrent stock/coupon updates, state transitions, token reuse, logout revocation, file ownership, file validation and constrained image import. UI smoke tests are in `frontend/tests/` and require the local development server running and Google Chrome installed. UI tests create clearly named demo accounts/products/orders in the development database; backend tests use their own database.

## Application rules

- VND integer amounts, represented as decimal strings in API JSON; backend calculates all totals.
- Checkout snapshots product names/prices and atomically updates inventory and coupon use.
- Idempotency keys avoid duplicated checkout submissions. Cancellation restores stock once and does not restore coupon use.
- COD demo: PENDING → CONFIRMED → SHIPPED → COMPLETED. Only PENDING can be cancelled.
- Private files are never served from the public image route.
- Access JWTs are held in memory; rotating refresh tokens use HttpOnly cookies. Session revocation is checked on every authenticated API request.
- Plain text reviews; no HTML rendering.

## Documentation

- [API contract](docs/openapi.yaml)
- Reports, scope and original evidence: `C:\Users\ADMIN\Desktop\pentest`.

## Educational purpose

This project was created for cybersecurity education, secure software development, and penetration testing practice in a controlled local environment. All tests must target systems owned by the project author or explicitly authorized for the exercise. Planned scenarios are not claims of discovered vulnerabilities in a third-party product.
