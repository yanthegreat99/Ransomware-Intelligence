# Ransomware Intelligence Platform

A Next.js and PostgreSQL threat-intelligence application for canonical ransomware victim records, source disclosures, deduplication, verification, GICS-aligned classification, analytics, and analyst review.

## Deployment

Deploy the GitHub-connected project through Prisma Composer in Prisma Console. Configure `DATABASE_URL` and the required application secrets in the Composer environment; do not put credentials in the repository.

The repository includes an initial migration from an empty database. Do not apply it to a database that already contains this application's tables or data until that database has been safely adopted into the migration history. Back up existing data before any migration work.

Install dependencies with `npm install`. Prisma ORM 8 generates the application contract with `npx prisma contract emit`; schema changes also need a reviewed migration in `migrations/app` before deployment. Prisma Composer applies the committed migration history during deployment.

## Local frontend

Start the Next.js development server:

```bash
npm run dev
```

Open:

- Dashboard: `http://localhost:3000`
- Victims: `http://localhost:3000/victims`
- Groups: `http://localhost:3000/groups`
- Countries: `http://localhost:3000/countries`
- Industries: `http://localhost:3000/industries`
- Analyst console: `http://localhost:3000/admin`

Set `ANALYST_ACCESS_SECRET` in `.env.local` to enable analyst sign-in. Its value is used as the password and is never sent to the browser.
Local database scripts load `DATABASE_URL` from `.env.local` (or `.env`) and close their Prisma ORM 8 client when finished.

## Environment variables

- `DATABASE_URL`: PostgreSQL connection string.
- `RANSOMLOOK_API_URL`: Optional documented RansomLook API endpoint.
- `RANSOMLOOK_API_KEY`: Not requested by the Composer module; the public `/posts` endpoint does not need it. Protected export endpoints require a key.
- `RANSOMWARELIVE_API_URL`: Ransomware.live v2 endpoint. Set to `false` to disable.
- `RANSOMWARELIVE_API_KEY`: Ransomware.live PRO token. Sent only as `X-API-KEY` to the configured PRO server API.
- `RANSOMWARELIVE_PRO_API_URL`: Optional PRO endpoint override; defaults to `https://api-pro.ransomware.live/victims/recent`.
- `RANSOMFEED_API_URL`: Ransomfeed public API; defaults to `https://api.ransomfeed.it`.
- `ANALYST_ACCESS_SECRET`: Bearer secret for protected analyst review mutations.
- `INGESTION_JOB_SECRET`: Shared bearer secret for scheduled ingestion.

No API keys or credentials belong in frontend code.

### Where to store the API token

For local development, copy `.env.example` to `.env.local` and set:

```text
RANSOMWARELIVE_API_KEY=your-token
```

Never put the token in `NEXT_PUBLIC_*` variables or repository files. For Vercel, add `RANSOMWARELIVE_API_KEY` under Project Settings → Environment Variables for the required environments. The server ingestion route sends it only as the `X-API-KEY` header.

The GitHub Actions workflow should store `INGESTION_URL` and `INGESTION_JOB_SECRET`, not the provider API key. Set `INGESTION_URL` to the deployed app's base URL, and set `INGESTION_JOB_SECRET` to the same value configured in Prisma Composer. The workflow appends `/api/ingest`. Provider keys remain server-side in the deployed backend. Ransomfeed is public and does not require a token; RansomLook public `/posts` access does not require a key, while export endpoints require `RANSOMLOOK_API_KEY`.

## Analyst operations

Manual victim creation and editing are available through `POST`/`PATCH /api/admin/victims`. All requests require:

```text
Authorization: Bearer $ANALYST_ACCESS_SECRET
Content-Type: application/json
```

Manual changes create `VictimEdit` audit records. Victim lists support `q`, `country`, `group`, `industry`, `from`, `to`, `sort`, `page`, and `pageSize` filters. Use `format=csv` or `format=json` on `/api/victims` for exports.

## Source ingestion

Source adapters convert provider responses into normalised disclosures. `POST /api/ingest` runs configured adapters, uses source name plus source identifier as an idempotency key, retains raw and normalised JSON, and records per-source reconciliation counters in the ingestion run metadata.

Source requests retry transient HTTP 429 and 5xx responses. Ransomfeed and ransomware.live are disabled only by setting their API URL variables to `false`; Ransomfeed is public and subject to a 5-request-per-minute limit. Concurrent runs for the same source are prevented by an expiring ingestion lease.

The reconciliation metadata distinguishes retrieved and normalized records, new and existing disclosures, changed disclosures, repeated source identifiers, canonical victims created or matched, rejected records, errors, and source warnings. Ransomfeed's documented API response limit is 1,000 records and provides no pagination cursor; a yearly response that reaches this limit is marked PARTIAL rather than reported as complete. Provider updates preserve the original payload and append the previous normalized version and source reference to `rawData.__ingestionHistory` before changing the current normalized record.

Call it from a scheduler with:

```text
Authorization: Bearer $INGESTION_JOB_SECRET
```

The RansomLook adapter is disabled until `RANSOMLOOK_API_URL` is configured. Additional sources require a documented API and a dedicated adapter.

## Database maintenance workflow

The GitHub Actions `Database maintenance` workflow runs daily at 03:00 UTC and can also be started manually. Add the Prisma PostgreSQL connection string as the repository Actions secret `DATABASE_URL` under Settings → Secrets and variables → Actions. Do not commit the connection string.

The workflow normalizes country values, backfills target domains, seeds GICS taxonomy, and applies ransomware-group merges. Group normalization uses `--apply`, which can merge groups and delete duplicate group rows. Review its logs after each run. Scheduled runs start only after this workflow is merged into the repository's default branch.

## Data integrity

Canonical victims are separate from source disclosures. Repeated source records update or link to an existing victim and never infer deletion. Duplicate matches contain a score and explanation. Verification and organisation legitimacy are stored separately. GICS fields and review history are retained, and GICS assignments are analytical rather than official MSCI classifications.

## Country normalization

Country values use ISO 3166-1 names and alpha-2 codes. Common source variants such as `USA`, `US`, `UK`, `GB`, and `UAE` are normalized before storage. Existing canonical records can be normalized with:

```bash
npm run countries:normalize
```

## Target domains and threat actors

Ransomfeed and ransomware.live website/domain fields are stored as both `targetedDomain` and normalized `targetedDomainNormalized` values. Victim profiles display the target domain and source description.

Ransomware group profiles can refresh RansomLook intelligence from:

```text
POST /api/groups/{groupId}/refresh
Authorization: Bearer $ANALYST_ACCESS_SECRET
```

The refresh stores associated clearweb/Tor locations, availability, parser status, aliases, and RansomLook profile URLs.

Threat-actor aliases are shared by ingestion, analytics, and the normalization script in `src/lib/group-name-aliases.json`. Name keys ignore case, spaces, and punctuation but preserve digits; fuzzy name similarity is not used to merge actors. Preview profile merges with `npm run groups:normalize`; apply a reviewed plan with `npm run groups:normalize -- --apply`. The script reassigns victim/disclosure links, retains source spellings, and snapshots retired group profiles.

The overview separates canonical victim totals from source-disclosure totals. Its date filters apply to victim trends and activity charts, while source coverage and current verification status are labeled as database-wide statistics. Public dashboard, country, and industry analytics are cached for five minutes to reduce repeated database reads.

## Full ingestion and duplicate testing

Run all configured historical adapters and then the global duplicate analysis:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer $INGESTION_JOB_SECRET"

curl -X POST http://localhost:3000/api/admin/deduplicate \
  -H "Authorization: Bearer $ANALYST_ACCESS_SECRET"
```

The duplicate endpoint is analysis-only. It creates scored `DuplicateMatch` records and does not automatically merge or delete canonical victims. Source disclosures remain linked to their canonical records and ingestion remains idempotent by source name plus source identifier.
