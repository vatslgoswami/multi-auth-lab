# Verification record

Verified locally on 13 November 2026 using Node.js 24.22.3, MongoDB 8.2.6, Playwright Chromium, and macOS arm64. This record describes artifact checks, not an AI-control experiment.

## Clean-copy checks

A separate local clone of commit `093e5b0` was used, with the pending README, environment card, screenshot, and CI workflow copied in for this verification. It did not use the source application checkouts or the original project's `node_modules` directory. The machine's existing Playwright browser cache was used.

- `npm ci` and the browser build completed. npm reported that optional `fsevents` install scripts were not approved; the build and browser tests still passed.
- Resetting a disposable test database twice and starting the API and web app succeeded; both local endpoints responded.
- The API suite passed **8 tests**, the browser suite passed **2 tests**, and the evaluator submission suite passed **3 tests**.
- All three task demos completed with their expected outcomes. Each baseline failed its new task; each reference solution passed. Controlled disclosure and revoked-write examples triggered their corresponding witnesses. The export-specific failure also failed its functionality check because it exposed an unshared private document. The fixed public-test gate rejected the controlled failures.
- Fresh exports of the account-switching and document-export tasks installed independently. Their baselines failed the new feature tests, while their reference patches passed **7** and **8** developer tests respectively.
- A scan of public source, documentation, task baselines, and generated browser assets found none of the selected original product identifiers or credential patterns. This is a targeted scan, not a guarantee that all sensitive information has been detected. The screenshot was visually inspected and contains synthetic workspace data.

The [CI workflow](../.github/workflows/ci.yml) was parsed locally and the MongoDB container tag was confirmed to exist. The workflow has **not** been executed on GitHub Actions yet.

## Artifact fingerprints

The evaluator checks every baseline file against its corresponding hash manifest before export or evaluation. These SHA-256 values identify the manifests and evaluator fixtures used for this record:

| File | SHA-256 |
| --- | --- |
| `tasks/cookie-migration/baseline-hashes.json` | `c0155da0adf2656fe4c9f0de1d54aa10ca6a5bd36b640e57b0be532f831b1e36` |
| `tasks/account-switching/baseline-hashes.json` | `cbaef01b6a81c3af0477df76e159c8b77f6da06ceb2b117ed67a54f820547ffc` |
| `tasks/document-export/baseline-hashes.json` | `e4f5d8603630608daaf3b9a72a9c70264bf8410ac5376968d9d545365608cf55` |
| `evaluator/fixtures/fixtures.js` | `1727d2f9015005ef8b1b2bb1944ce8d9af12856c35526c6c180ea13787972469` |
| `evaluator/fixtures/models.js` | `14073f54b5dc96f2677333ddd60f6a9cee80e7aa61ff1aab3ecc125afd83cee0` |

## What this does not establish

The checked-in examples are constructed validation cases, not model-generated attacks or a held-out evaluation. The local evaluator has no isolation from the code it executes. These checks do not establish attack strength, control effectiveness, model task difficulty, or absence of other backdoors. See the [environment card](environment-card.md).
