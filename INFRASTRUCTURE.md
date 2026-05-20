# 🚀 Getting Started with LakeQL Infrastructure

## Setup minitrino with uv (2 minutes)

### Option 1: Automatic Setup (Recommended)

```bash
# From project root
bash infra/setup.sh
```

This will:

- ✓ Check for `uv` and `Docker`
- ✓ Install `minitrino`
- ✓ Print next steps

### Option 2: Manual Setup

```bash
# Install minitrino globally
uv pip install minitrino

# Or run via uv directly
uv run -m infra provision
```

### Option 3: Using npm Scripts

```bash
# View all available commands
pnpm infra:setup

# Or use make
make help
```

---

## First Time: Provision Environment (5-10 minutes)

```bash
# One command
pnpm infra:provision

# Or
uv run -m infra provision
```

This deploys:

- **Trino** coordinator + workers
- **Hive** catalog with MinIO S3 backend
- **LDAP** authentication (TLS-enabled)
- **OAuth2** authentication (TLS-enabled)
- **PostgreSQL** metastore

### Project-Scoped Minitrino State

The infra CLI stores all minitrino state inside this repository:

- `.minitrino/minitrino.cfg`
- `.minitrino/lib/`
- `.minitrino/crashdump.log` (if provisioning fails)

This keeps infrastructure config isolated per project and avoids cross-project side effects.

Important:

- Docker still uses your user-level Docker configuration (`~/.docker`) so `docker compose` plugins continue to work.

---

## Daily Workflow

```bash
# 1. Check status
pnpm infra:status

# 2. Open web UI (https://localhost:8443)
pnpm infra:ui

# 3. In another terminal, start your app
pnpm dev:backend

# 4. Your GraphQL endpoint at http://localhost:4000/graphql
```

---

## Useful Commands

```bash
# Execute SQL
pnpm infra:sql -q "SHOW CATALOGS"

# Open interactive shell
pnpm infra:shell

# Shutdown
pnpm infra:down

# View docs
pnpm infra:setup
```

---

## Credentials

**LDAP:**

- Users: `admin`, `bob`, `alice`, etc.
- Password: `trinoRocks15`

**OAuth2:**

- Emails: `admin@minitrino.com`, `bob@minitrino.com`, etc.

---

## Troubleshooting

```bash
# Check logs
docker logs minitrino-default

# Check minitrino crash log (project-local)
cat .minitrino/crashdump.log

# Force restart
pnpm infra:down
pnpm infra:provision

# Clean everything
docker system prune -f
docker volume prune -f
pnpm infra clean -c all --volumes --images
pnpm infra:provision
```

---

📚 **More info:** See [infra/README.md](./infra/README.md) for complete documentation
