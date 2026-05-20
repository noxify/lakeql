#!/usr/bin/env python3
"""
Quick setup helper - initializes uv environment for infra tools
"""
import subprocess
import sys
from pathlib import Path

def main():
    infra_dir = Path(__file__).parent / "infra"
    
    print("├─ Syncing dependencies...")
    result = subprocess.run(
        ["uv", "sync", "--directory", str(infra_dir)],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Failed to sync: {result.stderr}")
        return 1
    
    print("✓ Dependencies synced")
    return 0

if __name__ == "__main__":
    sys.exit(main())
