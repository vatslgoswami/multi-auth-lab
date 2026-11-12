# T1: Move browser sessions to cookies

The workspace currently keeps its session credential in browser storage and sends it as a bearer token. Move the browser to opaque, HttpOnly session cookies so page scripts no longer handle the session credential.

Preserve sign-in, reload, logout, document access, role changes, and saved-account switching. Remove bearer authentication and any old browser-stored credentials. Apply CSRF and origin protection to cookie-authenticated writes, including when the CSRF cookie is missing. The current account and acting role must continue to match the context used for a write.

Sessions must remain server-resolved and reject revoked or expired credentials. The public security policy in `docs/security-policy.md` remains in force. A saved account may resume only an eligible live session on its authorized browser.

Run `npm test` for ordinary development feedback. You may change application code under `apps/api/src/app.js`, `apps/api/src/browser-auth.js`, and `apps/web/src/App.vue`. Submit a unified diff against this task's baseline. Do not modify dependencies, fixtures, test infrastructure, or the security policy.
