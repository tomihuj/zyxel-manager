# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Containerised multi-user web app for managing Zyxel USG FLEX firewalls at scale. GitHub: `tomihuj/zyxel-manager`.

**Stack:** FastAPI + SQLModel (Python 3.12) · React 18 + TypeScript + MUI · PostgreSQL 16 · Redis 7 · Celery · Nginx · Docker Compose

## Development

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY, ENCRYPTION_KEY
docker compose up --build
```

- App: http://localhost · API docs: http://localhost/docs · Flower: http://localhost:5555
- Backend hot-reloads via uvicorn `--reload`; frontend hot-reloads via Vite

**Generate ENCRYPTION_KEY:**
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Tests:**
```bash
docker compose run --rm backend pytest -v
docker compose run --rm backend pytest tests/test_rbac.py -v  # single file
```

**Migrations:**
```bash
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic revision --autogenerate -m "description"
```

**Seed database manually:**
```bash
docker compose run --rm backend python -m scripts.seed
```

**Production deploy:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

## Architecture

### Docker services

| Service | Purpose |
|---------|---------|
| `db` | PostgreSQL 16 |
| `redis` | Celery broker + cache |
| `backend` | FastAPI app (uvicorn, port 8000) |
| `worker` | Celery worker (4 concurrency) |
| `beat` | Celery Beat scheduler |
| `frontend` | Vite dev server (port 3000) |
| `nginx` | Reverse proxy (port 80) — routes `/api/` → backend, `/` → frontend |

Backend startup order: `alembic upgrade head` → `scripts.seed` → `uvicorn`.

### Backend (`backend/app/`)

```
main.py           — FastAPI app, CORS, lifespan
api/v1/           — Route handlers (one file per domain)
core/
  config.py       — Pydantic settings from env vars
  security.py     — Argon2 hashing, JWT, Fernet encryption
  deps.py         — FastAPI dependencies: CurrentUser, SuperUser, RBAC, DBSession
models/           — SQLModel ORM models (14 files)
services/
  rbac.py         — RBACService.can(feature, access_level, resource_type, resource_id)
  crypto.py       — encrypt/decrypt device credentials (Fernet)
  audit.py        — write_audit() helper
  diff.py         — compute_diff(), apply_patch() for config JSON
  email.py        — SMTP alert delivery
adapters/
  base.py         — FirewallAdapter abstract base (test_connection, fetch_config, apply_patch)
  registry.py     — get_adapter("mock" | "zyxel")
  mock.py         — In-memory mock (default for dev/test)
  zyxel.py        — Real Zyxel API (TODO placeholders — not yet implemented)
tasks/
  celery_app.py   — Celery config + beat schedule
  bulk.py, backup.py, drift.py, alerts.py, compliance.py, metrics.py, poll_devices.py
db/session.py     — SQLModel engine + session factory
```

**Authentication flow:**
1. `POST /api/v1/auth/login` → validates Argon2 password, returns `{access_token, refresh_token}`; Redis rate-limits to 5 failures per 10 min (15 min lockout)
2. All requests: `get_current_user()` dep tries JWT first, then API token (prefix `ztm_`)
3. RBAC: `RBACService.can(feature, access_level, resource_type, resource_id)` — superusers bypass all checks

**Adding a new endpoint:** create a handler in `api/v1/`, inject `CurrentUser`, `RBAC`, `DBSession` deps, register router in `api/v1/__init__.py`.

### Key models

| Model | Notes |
|-------|-------|
| `Device` | Has `deleted_at` (soft delete), `encrypted_credentials` (Fernet JSON), `drift_detected`, `adapter` ("mock"\|"zyxel") |
| `ConfigSnapshot` | Immutable; `section` + `version` + `checksum`; `is_baseline` for drift comparison |
| `BulkJob` | Preview → approve → Celery executes; `BulkJobTarget` stores before/after/diff per device |
| `Permission` | `feature` + `resource_type` + `resource_id` + `access_level`; wildcards supported |
| `ApiToken` | SHA256-hashed, prefix `ztm_`, optional IP allowlist |

### Celery beat schedule

| Task | Interval | Purpose |
|------|----------|---------|
| `poll_devices` | 30 s | Device online/offline status |
| `run_scheduled_jobs` | 60 s | Trigger cron-scheduled bulk jobs |
| `collect_all_metrics` | 5 min | CPU/memory/uptime per device |
| `scheduled_backup_check` | 15 min | Auto-backups when due |
| `check_drift_all` | 1 hr | Current config vs baseline |
| `run_compliance_check` | 1 hr | Compliance rules evaluation |
| `retry_failed_deliveries` | 5 min | Retry failed alert webhooks/emails |

### Frontend (`frontend/src/`)

```
main.tsx          — React root: QueryClient (30s stale, 1 retry), ThemeProvider, BrowserRouter
App.tsx           — Route definitions (19 pages, all protected except /login)
pages/            — Full-page components (Devices.tsx 957 lines, Backups.tsx 943 lines are largest)
components/       — Layout, ProtectedRoute, CommandPalette (Cmd+K), Toaster, ConfirmDialog
api/
  client.ts       — Axios instance at /api/v1; request interceptor adds Bearer token;
                    401 response → clear auth + redirect /login
  *.ts            — One module per domain matching api/v1/ routes
store/            — Zustand stores (auth persisted to localStorage as 'zyxel-auth', theme persisted)
types/index.ts    — All TypeScript interfaces (20+ types)
```

**State management split:** React Query for server state (device list, configs), Zustand for client state (auth, theme, toasts, filter state, column widths).

**Adding a new page:** create `pages/MyPage.tsx`, add route in `App.tsx`, add API module in `api/`, add nav entry in `components/Layout.tsx`.

### Testing

Tests use pytest with in-memory SQLite (`conftest.py`). No frontend tests. The `MockAdapter` is the default device adapter — no real Zyxel device needed. To add tests: add to `backend/tests/`, use the `session` and `client` fixtures from `conftest.py`.
