# Zyxel Firewall Management Platform

A containerised, multi-user web application for managing Zyxel USG FLEX firewalls at scale.
Supports device inventory, configuration snapshots, bulk changes, role-based access control,
and reporting/export.

---

## Quick Start

### Prerequisites
- Docker ≥ 24 and Docker Compose v2

### 1. Clone and configure

```bash
git clone <repo>
cd zyxel-manager
cp .env.example .env
# Edit .env — at minimum change all *_PASSWORD and SECRET_KEY values
```

Generate a valid `ENCRYPTION_KEY`:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2. Start

```bash
docker compose up --build
```

The app is available at **http://localhost** (port 80).
Default admin credentials come from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

API docs: http://localhost/docs

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password | *(required)* |
| `REDIS_PASSWORD` | Redis password | *(required)* |
| `SECRET_KEY` | JWT signing key (≥ 32 chars) | *(required)* |
| `ENCRYPTION_KEY` | Fernet key for device credentials | *(required)* |
| `ADMIN_EMAIL` | Seed admin email | `admin@example.com` |
| `ADMIN_USERNAME` | Seed admin username | `admin` |
| `ADMIN_PASSWORD` | Seed admin password | `Admin1234!` |
| `HTTP_PORT` | Host port for Nginx | `80` |
| `ENVIRONMENT` | `development` or `production` | `development` |

---

## Adding a Device

Via the **Devices** page in the UI, or via the API:

```bash
TOKEN=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -d "username=admin&password=Admin1234!" | jq -r .access_token)

curl -s -X POST http://localhost/api/v1/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Branch Office Firewall",
    "model": "USG FLEX 100",
    "mgmt_ip": "192.168.1.1",
    "port": 443,
    "protocol": "https",
    "adapter": "mock",
    "username": "admin",
    "password": "firewall_password",
    "tags": ["branch", "prod"]
  }'
```

Set `"adapter": "zyxel"` to use the real Zyxel integration (see below).

---

## How Bulk Changes Work

1. **Select targets** — choose devices by group, tag, or manually in the UI.
2. **Define change** — pick a config section (e.g. `ntp`) and supply a JSON patch.
3. **Preview diffs** — per-device before/after diff is computed without applying anything.
4. **Execute** — submits an async Celery job; each device is processed independently.
5. **Review results** — job logs show success/failure per target with full diff persisted.

### Example: update NTP servers via API

```bash
# Create job
JOB=$(curl -s -X POST http://localhost/api/v1/bulk/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Set corporate NTP",
    "section": "ntp",
    "patch": { "servers": ["192.168.0.10", "pool.ntp.org"] },
    "device_ids": ["<uuid1>", "<uuid2>"]
  }')

JOB_ID=$(echo $JOB | jq -r .id)

# Preview diffs
curl -s -X POST http://localhost/api/v1/bulk/jobs/$JOB_ID/preview \
  -H "Authorization: Bearer $TOKEN" | jq .

# Execute
curl -s -X POST http://localhost/api/v1/bulk/jobs/$JOB_ID/execute \
  -H "Authorization: Bearer $TOKEN"

# Poll status
curl -s http://localhost/api/v1/bulk/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq .status
```

---

## RBAC Configuration

Permissions are role-based and scoped to:

- **Features**: `view_devices`, `edit_devices`, `bulk_actions`, `export_reports`, `manage_users`
- **Resource types**: `device` (specific UUID), `group` (group UUID), `section` (config section name), `*` (all)
- **Access levels**: `read` or `write`

### Example: role with restricted access

```bash
# Create role
ROLE=$(curl -s -X POST http://localhost/api/v1/users/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "nat-editor", "description": "Can edit NAT only"}')

ROLE_ID=$(echo $ROLE | jq -r .id)

# Set permissions: write access to NAT section, read-only everything else
curl -X PUT http://localhost/api/v1/users/roles/$ROLE_ID/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"feature": "view_devices",  "resource_type": "*", "resource_id": "*", "access_level": "read"},
    {"feature": "edit_devices",  "resource_type": "section", "resource_id": "nat", "access_level": "write"},
    {"feature": "export_reports","resource_type": "*", "resource_id": "*", "access_level": "read"}
  ]'

# Assign role to user
curl -X POST http://localhost/api/v1/users/<user_id>/roles/$ROLE_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

## Adding a Real Zyxel Adapter

1. Edit `backend/app/adapters/zyxel.py` — fill in the `# TODO` sections with the correct API endpoints and payload shapes for your firmware version.
2. Set `"adapter": "zyxel"` when creating a device.
3. The adapter implements `test_connection`, `fetch_config`, `apply_patch`, `get_device_info`.

---

## Running Tests

```bash
docker compose run --rm backend pytest -v
```

---

## Production Deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Place TLS certificates at `infra/nginx/certs/{cert.pem,key.pem}` and configure `infra/nginx/nginx.prod.conf`.

---

## Architecture

```
┌─────────┐     ┌──────────┐     ┌──────────────────────────────┐
│ Browser │────▶│  Nginx   │────▶│  FastAPI backend  :8000      │
└─────────┘     │  :80     │     │  ├─ /api/v1/auth             │
                │          │     │  ├─ /api/v1/devices          │
                │          │     │  ├─ /api/v1/groups           │
                │          │────▶│  ├─ /api/v1/bulk             │
                │          │     │  ├─ /api/v1/reports          │
                │          │     │  └─ /api/v1/audit            │
                │          │────▶│  Vite frontend   :3000       │
                └──────────┘     └──────────────────────────────┘
                                          │           │
                                    ┌─────┘     ┌────┘
                                    ▼           ▼
                               PostgreSQL     Redis
                                 :5432    Celery worker
```

### Firewall Adapter Interface

```python
class FirewallAdapter:
    def test_connection(device, credentials) -> dict
    def fetch_config(device, credentials, section="full") -> dict
    def apply_patch(device, credentials, section, patch) -> dict
    def get_device_info(device, credentials) -> dict
```

Adapters: `mock` (in-memory, no device needed) · `zyxel` (real device, fill in TODOs)

### Config Sections

`interfaces` · `routing` · `nat` · `firewall_rules` · `vpn` · `users` · `dns` · `ntp` · `address_objects` · `service_objects`
