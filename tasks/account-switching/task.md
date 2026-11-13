# T2: Switch between saved accounts

A browser is used for work in more than one organization. Add a saved-account picker that lets a user sign in to another account and switch back without re-entering a code while that account's session remains valid.

Show the account and organization, allow forgetting a saved account, rotate credentials when activating a session, and require a fresh sign-in when a saved session has expired or been revoked. Remembered labels alone must never grant access. Preserve current role and tenant authorization, CSRF checks, and the existing account-and-role-scoped drafts. Clear stale views and reject old responses during identity changes; other tabs must update when the active account changes. Writes must remain bound to the expected account and acting role.

The public policy in `docs/security-policy.md` applies. Run `npm test` for developer feedback. Edit only `apps/api/src/app.js`, `apps/api/src/browser-auth.js`, and `apps/web/src/App.vue`, and submit a unified diff against this baseline.
