# LakeQL Infrastructure Setup

Simple infrastructure management for LakeQL using **minitrino + uv**.

## Prerequisites

- **uv** (>= 0.10.0) - [Install uv](https://docs.astral.sh/uv/)
- **Docker** (for running minitrino)
- **Python** 3.11+ (managed by uv)

## Quick Start

### 1. First Time Setup (5-10 minutes)

```bash
# Provision environment with default modules (hive, ldap, oauth2)
pnpm infra:provision
```

This starts:

- Trino coordinator + workers
- Hive catalog with MinIO S3 storage
- LDAP authentication (with TLS)
- OAuth2 authentication (with TLS)
- PostgreSQL metastore

### 2. Verify Everything Works

```bash
# Check resources
pnpm infra:status

# Open web UI
pnpm infra:ui
```

Login at **https://localhost:8443** with:

- **LDAP**: Username `admin`, password `trinoRocks15`
- **OAuth2**: Email `admin@minitrino.com`

### 3. Test Your GraphQL Backend

```bash
# In another terminal, start your app
pnpm dev:backend
```

## Commands

### Using pnpm (Recommended)

```bash
pnpm infra:provision     # Provision cluster
pnpm infra:status        # Check status
pnpm infra:shell         # Open shell
pnpm infra:sql -q "..."  # Execute SQL
pnpm infra:ui            # Open web UI
pnpm infra:down          # Shutdown
```

### Cluster Management

```bash
# Provision with custom modules
uv run -m infra provision -m postgres -m iceberg

# Add worker nodes
uv run -m infra provision --workers 2

# Verbose output
uv run -m infra provision -v

# Check status
uv run -m infra status -v
```

### Interactive Access

```bash
# Open shell in coordinator
uv run -m infra shell

# Execute SQL directly
uv run -m infra sql -q "SHOW CATALOGS"

# Execute SQL from file
uv run -m infra sql -f query.sql
```

### Lifecycle

```bash
# Open web UI
uv run -m infra ui

# Shutdown (graceful)
uv run -m infra down

# Shutdown (force kill)
uv run -m infra down --sig-kill

# Remove all images
uv run -m infra clean -c all --images

# Remove all volumes
uv run -m infra clean -c all --volumes
```

## Default Credentials

### LDAP

- **Users**: admin, bob, alice, cachesvc, metadata-user, platform-user, test
- **Password**: trinoRocks15

### OAuth2

- **Email admin**: admin@minitrino.com
- **Email users**: bob@minitrino.com, alice@minitrino.com, etc.
- **Flow**: Mock OAuth2 server (redirects to https://host.docker.internal:8100)

## Common Tasks

### Test Hive Catalog

```bash
uv run -m infra sql -q "SELECT * FROM hive.tpch.customer LIMIT 5"
```

### Check MinIO Storage

```bash
# minitrino automatically provisions MinIO
# Access S3 at http://localhost:9000
# Default credentials in docker-compose output
```

### Add LDAP User

```bash
# Access shell and use ldapmodify
uv run -m infra shell
ldapmodify -x -D "cn=admin,dc=minitrino,dc=com" \
  -w trinoRocks15 -H ldaps://ldap:636 -f user.ldif
```

### Custom SQL Setup

Create `setup.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS hive.mydata;
CREATE TABLE hive.mydata.mytable AS
SELECT * FROM tpch.tiny.customer;
```

Then run:

```bash
uv run -m infra sql -f setup.sql
```

## Development Workflow

```bash
# 1. Terminal 1 - Start minitrino
uv run -m infra provision

# 2. Terminal 2 - Start your GraphQL backend
pnpm dev:backend

# 3. Terminal 3 - Open trino CLI if needed
uv run -m infra shell

# 4. Make changes to your code, backend auto-restarts
# 5. Test GraphQL endpoint: http://localhost:4000/graphql
```

## How It Works

- **uv**: Manages Python environment and minitrino installation
- **minitrino**: CLI tool that orchestrates Docker containers via compose
- **Modules**: Preconfigured services (hive, ldap, oauth2, tls)
- **Bootstrap Scripts**: Auto-configuration and initialization

### Project-Scoped State

The LakeQL infra CLI scopes minitrino state to this repository:

- `.minitrino/minitrino.cfg`
- `.minitrino/lib/`
- `.minitrino/crashdump.log` (on failures)

This makes setups deterministic and avoids mixing state with other projects.

Note: Docker keeps using your user-level config (`~/.docker`) so `docker compose` plugin resolution continues to work.

## Troubleshooting

### Provisioning hangs

```bash
# Check logs
docker logs minitrino-default

# Inspect project-local minitrino crash dump
cat .minitrino/crashdump.log

# Force stop and restart
docker compose down -v
uv run -m infra provision
```

### Can't reach web UI

```bash
# Ensure TLS module is provisioned
uv run -m infra status

# Check if port 8443 is open
lsof -i :8443
```

### LDAP/OAuth2 not working

```bash
# Check authentication logs
docker logs minitrino-default | grep -i auth

# Verify TLS certificates
docker exec minitrino-default ls -la /etc/trino/tls/
```

### Clean slate

```bash
# Remove everything and restart
docker system prune -f
docker volume prune -f
uv run -m infra clean -c all --volumes --images
uv run -m infra provision
```

## More Information

- [minitrino Documentation](https://minitrino.readthedocs.io/)
- [Trino Documentation](https://trino.io/docs/current/)
- [uv Documentation](https://docs.astral.sh/uv/)

## Notes

- First provisioning takes ~5 minutes (Docker image build)
- Subsequent provisions are faster (~1 minute)
- Web UI accessible via `https://localhost:8443` (self-signed certificate)
- All default modules are open-source (Trino-compatible)
