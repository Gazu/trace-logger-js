# Versioning Policy

This project uses synchronized Semantic Versioning for the publishable npm packages:

- `@smb-tech/logger-core`
- `@smb-tech/logger-node`
- `@smb-tech/logger-react`

All three packages should be released with the same version number. This keeps adoption simple because runtime adapters depend on the same contract implemented by `logger-core`.

## Version Format

Versions follow `MAJOR.MINOR.PATCH`.

- `PATCH`: bug fixes, documentation fixes, internal refactors, test updates, and behavior corrections that do not change the public API or log payload contract.
- `MINOR`: backward-compatible features, new helpers, new framework integrations, new optional configuration, additional metrics, or additive payload fields that do not break existing consumers.
- `MAJOR`: breaking changes to public TypeScript APIs, package exports, default runtime behavior, supported Node/React versions, or the stable top-level log payload contract.

## Log Payload Contract

The log payload contract is versioned by the npm package version. The payload must not include a `schemaVersion` field.

Current stable top-level fields:

- `ts`
- `uuid`
- `type`
- `msg`
- `class`
- `pii`
- `thread`
- `mdc`
- `data`
- `tags`
- `exception`

Removing, renaming, or changing the type/meaning of one of these top-level fields requires a major version bump.

Adding a new optional top-level field is allowed in a minor release only when existing consumers can safely ignore it. If that assumption is not safe for known consumers, treat it as a major release.

Changes inside `mdc`, `data`, `tags`, or `exception` should be evaluated by compatibility:

- additive optional fields are usually minor changes;
- renamed or removed fields are major changes;
- safer serialization, redaction, or normalization that preserves the documented shape is usually patch-level.

## Release Rules

Before every release:

```bash
npm run test
npm run build
```

For a version bump:

1. Update the root package version and all publishable package versions.
2. Update internal workspace dependency versions between packages.
3. Keep README examples aligned with the published package names.
4. Confirm contract tests still cover the stable payload shape.
5. Tag the release as `vX.Y.Z`.

## Pre-release Channels

Use npm pre-release versions for unstable changes:

- `1.1.0-beta.0`
- `2.0.0-rc.0`

Pre-releases can be published under a matching npm dist-tag such as `beta` or `next`. Stable releases should use the default `latest` tag.
