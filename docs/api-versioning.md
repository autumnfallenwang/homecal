# HomeCal API versioning

## Current state

- **Stable version**: `v1`
- **All routes** are mounted under both `/api/v1/...` (versioned) and `/api/...` (legacy unprefixed).
- **Legacy `/api/*` is deprecated** and will be removed when all callers (web, iOS) have migrated. Until then, every legacy response carries `Deprecation: true`, `Sunset: <date>`, and `Link: </api/v1/...>; rel="successor-version"` headers per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) and [draft-ietf-httpapi-deprecation-header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header).

## Policy

### When to add a new version

Add a new version (`/api/v2`, `/api/v3`, ...) **only** when the change would break existing clients. Examples that warrant a new version:

- Removing a field from a response
- Renaming a field
- Changing a field's type
- Removing an endpoint
- Changing an endpoint's URL or HTTP method
- Tightening validation in a way that rejects previously-accepted requests
- Changing authentication/authorization semantics

### When NOT to add a new version

The following are **additive** and should always go on the **current** version:

- Adding a new optional response field
- Adding a new endpoint
- Adding a new optional request field
- Loosening validation
- Performance improvements
- Bug fixes that bring behavior in line with documentation

### Deprecation lifecycle

1. **Decide**: a breaking change is necessary. Open a tracking issue.
2. **Mint a new version**: add `/api/v2/...` mounts alongside `/api/v1/...`. Both run in parallel.
3. **Document the diff**: append a "v1 → v2 migration" section to this doc with field-by-field changes and a recommended migration order.
4. **Stamp deprecation headers** on the old version with a sunset date at least **3 months** out.
5. **Migrate first-party clients** (web, iOS) within the deprecation window.
6. **Remove the old version mount** on or after the sunset date. Document the removal in `docs/lessons.md`.

## Headers reference

Every response from a deprecated mount includes:

| Header | Value | Purpose |
|---|---|---|
| `Deprecation` | `true` | Signals the endpoint is deprecated (RFC 8594) |
| `Sunset` | HTTP date | The instant after which the endpoint may stop responding |
| `Link` | `</api/vN/...>; rel="successor-version"` | Points clients at the replacement |

Override the default sunset date by setting the `LEGACY_API_SUNSET` env var (HTTP date format).

## Auth routes

`/api/auth/*` is **not versioned** and never carries deprecation headers. Better Auth owns that surface area; if Better Auth ever ships a breaking change, we deal with it through their migration guide rather than our own versioning scheme.

## Excluded surfaces

The following paths are NOT under the versioning policy:

- `/api/auth/*` — Better Auth, see above
- `/health` — operational endpoint, never breaking
- `/api/openapi.json` — OpenAPI 3.1 spec, public, hand-curated, only documents `/api/v1/*` paths
- `/api/docs` — Swagger UI page loaded from a CDN, points at `/api/openapi.json`

## Client guidance

- **New clients**: always use `/api/v1/...`. Treat unversioned `/api/...` as deprecated.
- **Existing clients on `/api/...`**: migrate to `/api/v1/...` opportunistically — usually a one-line base URL change. The bodies are identical.
- **Generating a typed client**: pull `/api/openapi.json` (after task 73 lands) and run `openapi-typescript` against it. The OpenAPI spec only documents `/api/v1/*` paths.
