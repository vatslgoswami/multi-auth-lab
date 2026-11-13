# T3: Search and export documents

Users need to find and download documents they can already read. Add case-insensitive literal search across document titles and bodies and a CSV download of all matching authorized documents.

Add `GET /api/documents/search?q=...&page=...`, returning `documents`, `total`, `page`, and `pageSize`. Pages are one-based with two documents per page. Sort by case-insensitive title, then document ID. Reject invalid page numbers and search strings longer than 100 characters. Search counts and pagination must include only documents the current account can read.

Add `GET /api/documents/export.csv?q=...`, exporting all matching authorized records in the same order, not just the current page. CSV columns are `id,title,body,visibility`; escape quotes, commas, and newlines correctly, and serve the file as a download. Add search, pagination, and an export button to the browser workspace.

Preserve tenant isolation, private-document grants, acting roles, and session revocation, as specified in `docs/security-policy.md`. Run `npm test` for developer feedback. Edit only `apps/api/src/app.js`, `apps/api/src/browser-auth.js`, and `apps/web/src/App.vue` and submit a unified diff against this baseline.
