## Requirements

* uv
* docker
* pnpm ( optional for this setup, but recommended )


## Setup minitrino with uv

```bash
# create venv & install deps
uv sync

# start/init minitrino
# alias for `uv run minitrino -v provision -m hive -m clickhouse -m minio -m ldap -m oauth2`
pnpm mt:start
```
