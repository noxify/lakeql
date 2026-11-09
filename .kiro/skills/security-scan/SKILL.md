---
name: security-scan
description: Run a local security review of LakeQL changes as a quota-free stand-in for GitHub's hosted "AI security scan". Combines deterministic OSS tools (semgrep, osv-scanner, gitleaks, pnpm audit), an optional deep CodeQL taint-tracking pass, and an agent-driven semantic review against a LakeQL-specific checklist (SQL/command injection, identifier quoting, auth/OBO, secrets, storage path handling). Defaults to reviewing the diff against main; can scan the whole repo. Fully local, no Copilot and no LLM quota. Manual runbook only — nothing here runs in CI.
---

# LakeQL local security scan — manual runbook

A local, quota-free security review that stands in for GitHub's hosted **AI security scan** (the `argus.js` job that fails once the monthly LLM quota is exhausted). It does **not** reproduce GitHub's proprietary scanner; it serves the same purpose with tools you control.

Three layers:

1. **Deterministic layer (fast, default)** — OSS tools that produce reproducible findings with zero LLM involvement: `semgrep` (pattern-based SAST), `osv-scanner` + `pnpm audit` (dependency CVEs), `gitleaks` (secrets).
2. **Deep layer (optional, opt-in)** — `CodeQL` taint-tracking analysis. Slower and heavier than semgrep (builds a database, downloads query packs), but it follows dataflow from source to sink across files, so it can confirm whether user input actually reaches a SQL/command/prototype-pollution sink rather than just pattern-matching. This is the closest local equivalent to GitHub's classic Code Scanning. Run it for release sweeps or security-sensitive changes, not every PR.
3. **Semantic layer** — the agent (me) reads the change and reviews it against the LakeQL-specific checklist below. This is the part closest to the hosted "AI scan", but it runs here, in this session, with no external service and no quota.

This is a **manual review**, not an automated test. It lives under `.kiro/skills/` as prose + commands and has **zero CI footprint**. Do not convert it into a `*.test.ts` under `packages/`, and do not wire it into a workflow — the whole point is that it runs locally on demand.

GitHub Copilot is intentionally **not** used: there is no stable, scriptable Copilot API for diff-scanning, and the semantic review is better handled by the agent directly against this checklist. A Copilot subscription adds nothing to this local flow.

## When to use this

- Before opening or merging a PR that touches security-sensitive surfaces: SQL dialects, query execution, identifier/literal quoting, auth/token resolvers, the OBO flow, storage/path handling, or dependency changes.
- To reproduce locally what the hosted AI scan would have flagged, without the quota failure.
- As a periodic whole-repo sweep (slower; run deliberately, not per PR).

## Scope: default to the diff

Default target is the change set against `main`, not the whole tree. Reviewing a diff is fast, focused, and matches how the hosted scan reports per-PR. Whole-repo is an explicit opt-in.

```bash
REPO=/Users/marcusreinhardt/Development/pocs/lakeql
cd "$REPO"

# the diff under review (adjust base as needed)
BASE=${BASE:-main}
git fetch origin "$BASE" >/dev/null 2>&1 || true
git --no-pager diff --stat "origin/$BASE...HEAD"      # what changed
CHANGED=$(git diff --name-only "origin/$BASE...HEAD" | grep -E '\.(ts|mts|cts|js|mjs|cjs)$' || true)
echo "$CHANGED"
```

## Prerequisites — install the deterministic tools

None of these ship with the repo. `pnpm` is present; the rest install via Homebrew (present at `/opt/homebrew/bin/brew`). Install only what you intend to run.

```bash
brew install semgrep osv-scanner gitleaks
# pnpm audit is built in — no install needed
```

Verify:

```bash
for t in semgrep osv-scanner gitleaks pnpm; do
  command -v "$t" >/dev/null 2>&1 && echo "ok   $t" || echo "MISS $t"
done
```

If a tool is missing and you do not want to install it, skip that step and note in the report that the corresponding coverage was not run. Do not silently claim coverage you did not produce.

## 1. Deterministic layer

### 1a. Dependency vulnerabilities

```bash
cd "$REPO"
pnpm audit --audit-level=moderate || true          # workspace-wide advisories
osv-scanner --lockfile=pnpm-lock.yaml || true      # cross-checks the OSV database
```

Dependency changes are a common finding source; this directly complements the Dependabot setup already in the repo.

**Verify severity against the advisory, and trace the dependency path — do not trust `pnpm audit`'s label alone.** `pnpm audit` may report or ignore an advisory at a severity that differs from the published GHSA/CVE (this has happened: a High CVSS advisory showed up as an ignored "low"). For each hit:

```bash
# why is it here, and is it runtime or dev-only?
pnpm why <pkg> -r
```

Then read the GHSA/CVE for the real severity and affected versions, and weigh it against the path: a High advisory that only enters through **devDependencies** (build/CLI tooling), with no attacker-controlled input to the vulnerable function, is low _real_ risk and a documented ignore is legitimate. Record severity **and** the runtime-vs-dev path in the report, not just the tool's number.

### 1b. Static analysis (SAST)

```bash
# whole repo, auto config (security + best-practice rulesets)
semgrep scan --config=auto --error --json --output=.agents/tasks/security-scan/semgrep.json packages || true

# diff-only variant (faster, PR-focused):
#   semgrep scan --config=auto --baseline-commit "origin/$BASE" packages
```

Focus on `ERROR`/`WARNING` findings in `security.*` categories. Expect some noise — triage, do not dump raw output into the report.

### 1c. Secret scanning

```bash
gitleaks detect --no-banner --redact --source . || true
# or scan only the diff:
#   gitleaks protect --staged --no-banner --redact
```

Treat any hit as high-priority. Reference secrets by key name, never echo the value.

### 1d. Deep SAST with CodeQL (optional — opt-in)

Skip this for a quick PR check; run it for release sweeps or security-sensitive changes. It is the only layer that follows dataflow (taint tracking) across files, so it answers "does untrusted input actually reach a SQL/command/prototype-pollution sink?", which the pattern layers cannot.

**Install (once):**

```bash
brew install --cask codeql        # CLI binary only; query packs auto-download on first analyze
codeql version --format=terse     # expect 2.27.x or newer
```

On macOS the cask may be Gatekeeper-quarantined on first run; if the binary is blocked, approve it once under System Settings → Privacy & Security. Query packs (`codeql/javascript-queries`) download from the GitHub registry on the first `database analyze` — needs network.

**Build the database from source, excluding build output and tests** (the lesson from the first run: `dist/` and `tests/` add noise). `javascript` covers TypeScript too:

```bash
cd "$REPO"
rm -rf .agents/tasks/security-scan/codeql-db
codeql database create .agents/tasks/security-scan/codeql-db \
  --language=javascript \
  --source-root=packages \
  --overwrite
# NOTE: to cut noise, exclude dist/tests. The simplest reliable way is a
# paths/paths-ignore filter in a config file passed via --codescanning-config,
# or build from a source tree without dist/ present. At minimum, discount
# any finding under **/dist/** or **/tests/** during triage (see below).
```

**Analyze with the security-extended suite (taint tracking):**

```bash
codeql database analyze .agents/tasks/security-scan/codeql-db \
  codeql/javascript-queries:codeql-suites/javascript-security-extended.qls \
  --format=sarifv2.1.0 \
  --output=.agents/tasks/security-scan/codeql.sarif \
  --download
```

**Summarize the SARIF** (findings grouped by rule, with security-severity and file:line):

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const sarif = JSON.parse(readFileSync('.agents/tasks/security-scan/codeql.sarif','utf8'));
for (const run of sarif.runs||[]) {
  const rules = {};
  for (const r of run.tool?.driver?.rules||[]) rules[r.id]=r.properties?.['security-severity']||'?';
  const byRule = {};
  for (const res of run.results||[]) {
    const loc = res.locations?.[0]?.physicalLocation;
    (byRule[res.ruleId] ||= []).push((loc?.artifactLocation?.uri)+':'+(loc?.region?.startLine));
  }
  for (const [rid,hits] of Object.entries(byRule))
    console.log('['+(rules[rid]||'?')+'] '+rid+' ('+hits.length+')\n   '+hits.slice(0,15).join('\n   '));
  console.log('TOTAL', (run.results||[]).length);
}
"
```

**Triage guidance (from the verified run):**

- The injection queries (SQL, command, CWE-915 prototype pollution) running with **zero** findings is a strong, taint-level signal — report it explicitly as a positive result, not just silence.
- **Discount** findings under `**/dist/**` (build output) and `**/tests/**` (fixtures). They are not the production surface.
- `js/insecure-temporary-file` can be a false positive when the code writes to a user-supplied output path rather than `os.tmpdir()` — read the flagged line before reporting it.
- `js/file-system-race` (TOCTOU: `existsSync` + act) is low real risk in a local CLI/scaffold tool that is the sole writer of its own directory. Note it; suggest atomic write-then-rename as optional hardening.
- `js/polynomial-redos` on config/schema-derived strings (type names, field names) is low risk when the input is bounded; suggest a length cap if the string can be attacker-controlled and unbounded.

## 2. Semantic layer — agent review against the LakeQL checklist

Read the changed files (or the whole package for a sweep) and review each item below. This is LakeQL-specific because the codebase's real risk surface is SQL generation, query execution, and request-scoped auth.

**SQL injection / identifier & literal handling**

- Every identifier reaches SQL through the adapter's quoting helper (e.g. Trino's `quoteIdentifier` / `quoteQualifiedIdentifier`), never via string interpolation.
- Every literal is escaped (e.g. `escapeLiteral`) or parameterized — no raw user value concatenated into SQL.
- New metadata queries (`SHOW`, `information_schema`) quote the catalog and escape the schema/table, matching the existing adapter pattern.
- Column/table types are validated against the scalar whitelist before DDL (as `createTable` does), not passed through.

**Command injection / shell**

- No user- or config-derived value is interpolated into a shell string. Prefer array-form execution.

**Auth, tokens, and the OBO flow**

- Token resolvers fail **closed**: an authenticated user whose token cannot be exchanged throws (`AuthenticationError`), never falls back to broader service credentials (this is the documented OBO invariant).
- `requestAuth` / raw tokens (`__rawToken`) are never logged, echoed in errors, or persisted.
- Adapter capability checks are respected — e.g. an adapter that rejects `requestAuth` must keep rejecting it, not silently accept.

**Secrets & config**

- No hardcoded credentials, keys, or tokens. New `env` entries have a schema entry and are documented in `.env.example` with a placeholder, not a real value.
- Error messages and logs do not leak secret values, connection strings, or full tokens.

**Input validation & deserialization**

- External input (GraphQL args, `endpoint.json`, config) is validated with Zod before use; no `JSON.parse` result is trusted unvalidated.
- Regex from user/config input is bounded (watch for ReDoS in validation refinements).

**Storage / path handling**

- Object keys / paths derived from input are validated; no path traversal into unintended prefixes. `deleteKeys`/`deletePrefix`-style operations cannot be steered to delete outside the intended prefix.

**Dependencies**

- New dependencies are pinned to exact versions, actively maintained, and not plausible typosquats.

## 3. Write the report

Collect all layers into one report. Keep the deterministic tool output as evidence and the semantic findings as prose with file:line references and a severity.

```bash
mkdir -p "$REPO/.agents/tasks/security-scan"
# write findings to: .agents/tasks/security-scan/report.md
```

Report structure:

- **Scope** — diff vs `main` (name the base/SHA) or whole-repo, and which tools actually ran vs skipped (including whether the optional CodeQL pass was run).
- **Deterministic findings** — per tool, triaged (not raw dumps), each with severity and file:line. For dependency advisories, record both the GHSA/CVE severity and the runtime-vs-dev path, not just the `pnpm audit` label.
- **Deep SAST (CodeQL)** — if run: state the suite and file count, call out explicitly that the injection/taint queries found nothing (a positive result worth stating), and triage the remaining findings per the guidance in 1d.
- **Semantic findings** — per checklist category, each with file:line, why it is a risk in this codebase, and a suggested fix.
- **Not verified** — anything you could not check (tool not installed, area out of scope, CodeQL skipped). Be explicit; do not imply coverage you did not run.

## Cleanup

The scan is read-only except for the report and tool output under `.agents/tasks/security-scan/`. The CodeQL database (`codeql-db/`) is large (tens of MB); remove it once the SARIF is summarized, and drop the whole directory if you do not want to keep the artifacts:

```bash
rm -rf "$REPO/.agents/tasks/security-scan/codeql-db"   # large; safe to delete after summarizing
rm -rf "$REPO/.agents/tasks/security-scan"             # everything, if keeping nothing
```

Nothing else is created or modified. Note: `.agents/tasks/` is outside `packages/` and has no CI footprint; do not commit the scan artifacts.
