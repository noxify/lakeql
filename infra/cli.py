#!/usr/bin/env python3
"""
Infrastructure CLI for LakeQL
Manages minitrino clusters
"""
import subprocess
import sys
import os
from pathlib import Path
import click


PROJECT_ROOT = Path(__file__).parent.parent
INFRA_CONFIG = Path(__file__).parent / "minitrino-config.yaml"
USER_HOME = Path.home()
MINITRINO_HOME = PROJECT_ROOT / ".minitrino"
MINITRINO_CFG = MINITRINO_HOME / "minitrino.cfg"
PROJECT_MINITRINO_LIB = PROJECT_ROOT / ".minitrino" / "lib"


def _minitrino_env() -> dict[str, str]:
    env = os.environ.copy()
    env["HOME"] = str(PROJECT_ROOT)
    env["LIB_PATH"] = str(PROJECT_MINITRINO_LIB)
    # Keep Docker Desktop / docker compose plugin resolution intact.
    env["DOCKER_CONFIG"] = str(USER_HOME / ".docker")
    return env


def _minitrino_cmd(*args: str, verbose: bool = False) -> list[str]:
    cmd = ["minitrino", "-e", f"LIB_PATH={PROJECT_MINITRINO_LIB}"]
    if verbose:
        cmd.append("-v")
    cmd.extend(args)
    return cmd


def _run_minitrino(*args: str, verbose: bool = False) -> None:
    subprocess.run(
        _minitrino_cmd(*args, verbose=verbose),
        check=True,
        env=_minitrino_env(),
    )


def _ensure_minitrino_cfg() -> None:
    if MINITRINO_CFG.exists():
        return

    MINITRINO_HOME.mkdir(parents=True, exist_ok=True)
    MINITRINO_CFG.write_text(
        "[config]\n"
        f"LIB_PATH={PROJECT_MINITRINO_LIB}\n"
        "CLUSTER_NAME=default\n",
        encoding="utf-8",
    )


def _ensure_minitrino_library(verbose: bool = False) -> None:
    # The minitrino library is considered installed once minitrino.env exists.
    if (PROJECT_MINITRINO_LIB / "minitrino.env").exists():
        return

    click.echo("📦 Installing minitrino library (first run)...")
    PROJECT_MINITRINO_LIB.mkdir(parents=True, exist_ok=True)
    _run_minitrino("lib-install", verbose=verbose)
    click.echo("✅ minitrino library installed")


def _ensure_minitrino_ready(verbose: bool = False) -> None:
    _ensure_minitrino_cfg()
    _ensure_minitrino_library(verbose=verbose)


@click.group()
def main():
    """LakeQL Infrastructure Management"""
    pass


@main.command()
@click.option("--modules", "-m", multiple=True, default=["hive", "ldap", "oauth2"],
              help="Modules to provision (default: hive, ldap, oauth2)")
@click.option("--workers", "-w", type=int, default=0, help="Number of worker nodes")
@click.option("--verbose", "-v", is_flag=True, help="Verbose output")
def provision(modules, workers, verbose):
    """Provision minitrino environment"""
    _ensure_minitrino_ready(verbose=verbose)
    cmd = _minitrino_cmd("provision", verbose=verbose)
    
    for module in modules:
        cmd.extend(["-m", module])
    
    if workers > 0:
        cmd.extend(["--workers", str(workers)])
    
    click.echo(f"🚀 Provisioning minitrino with modules: {', '.join(modules)}")
    subprocess.run(cmd, check=True, env=_minitrino_env())
    click.echo("✅ Provisioning complete!")


@main.command()
@click.option("--verbose", "-v", is_flag=True, help="Verbose output")
def status(verbose):
    """Check cluster status"""
    _ensure_minitrino_ready(verbose=verbose)
    cmd = _minitrino_cmd("resources", verbose=verbose)
    if verbose:
        cmd.extend(["--container", "--volume"])
    
    subprocess.run(cmd, check=True, env=_minitrino_env())


@main.command()
def shell():
    """Open shell in coordinator container"""
    _ensure_minitrino_ready()
    _run_minitrino("exec", "-i")


@main.command()
@click.option("--query", "-q", help="SQL query to execute")
@click.option("--file", "-f", type=click.File("r"), help="SQL file to execute")
def sql(query, file):
    """Execute SQL in trino-cli"""
    if file:
        query = file.read()
    elif not query:
        click.echo("Error: Provide --query or --file", err=True)
        sys.exit(1)
    
    _ensure_minitrino_ready()

    cmd = _minitrino_cmd(
        "exec", "-i", "trino-cli",
        "--user", "admin",
        "--execute", query,
    )
    subprocess.run(cmd, check=True, env=_minitrino_env())


@main.command()
@click.option("--sig-kill", is_flag=True, help="Force kill instead of graceful shutdown")
@click.option("--keep", is_flag=True, help="Keep containers instead of removing")
def down(sig_kill, keep):
    """Shutdown minitrino cluster"""
    _ensure_minitrino_ready()
    cmd = _minitrino_cmd("down")
    if sig_kill:
        cmd.append("--sig-kill")
    if keep:
        cmd.append("--keep")
    
    click.echo("🛑 Shutting down minitrino...")
    subprocess.run(cmd, check=True, env=_minitrino_env())
    click.echo("✅ Shutdown complete!")


@main.command()
@click.option("--cluster", "-c", default="all", help="Cluster to remove (default: all)")
@click.option("--images", is_flag=True, help="Remove images")
@click.option("--volumes", is_flag=True, help="Remove volumes")
def clean(cluster, images, volumes):
    """Clean minitrino resources"""
    _ensure_minitrino_ready()
    if not images and not volumes:
        click.echo("Specify --images and/or --volumes", err=True)
        sys.exit(1)
    
    cmd = _minitrino_cmd("-c", cluster, "remove")
    if images:
        cmd.append("--images")
    if volumes:
        cmd.append("--volumes")
    
    click.confirm("This will remove resources. Continue?", abort=True)
    subprocess.run(cmd, check=True, env=_minitrino_env())
    click.echo("✅ Cleanup complete!")


@main.command()
def setup_docs():
    """Print setup documentation"""
    docs = """
╔════════════════════════════════════════════════════════════════╗
║           LakeQL Infrastructure Setup                          ║
║                 Powered by minitrino + uv                      ║
╚════════════════════════════════════════════════════════════════╝

📋 Quick Start:

  1. Provision environment (first time, ~5 min):
     uv run -m infra provision

  2. Check status:
     uv run -m infra status

  3. Access trino-cli:
     uv run -m infra shell

  4. Run SQL:
     uv run -m infra sql -q "SHOW SCHEMAS FROM hive"

  5. Shutdown:
     uv run -m infra down

📚 Available Commands:

  provision   - Set up minitrino with default modules (hive, ldap, oauth2)
  status      - Check cluster resources and status
  shell       - Open interactive shell in coordinator
  sql         - Execute SQL queries
  down        - Shutdown cluster
  clean       - Remove images/volumes

🔑 Default Credentials:

  LDAP:
    username: admin, bob, alice, etc.
    password: trinoRocks15

  OAuth2:
    email: admin@minitrino.com, bob@minitrino.com, etc.
    (use mock OAuth2 flow during login)

📝 Examples:

  # Provision with 2 workers
  uv run -m infra provision --workers 2

  # Verbose provisioning
  uv run -m infra provision -v

  # Run custom SQL
  uv run -m infra sql -q "SELECT version()"

  # Execute SQL from file
  uv run -m infra sql -f query.sql

👤 Troubleshooting:

  # View logs
  docker logs minitrino-default

  # Clean everything and re-provision
  docker compose down -v
  docker system prune
  uv run -m infra provision

ℹ️  For more: https://minitrino.readthedocs.io/
"""
    click.echo(docs)


if __name__ == "__main__":
    main()
