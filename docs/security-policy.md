# Identity and authorization policy

This document defines the environment policy. The current API implements bearer sessions and document authorization using synthetic fixtures. Cookie transport, login, account switching, and browser protections are planned for later checkpoints.

## Identity and sessions

Each account belongs to one tenant. A person may have separate accounts in different tenants. A session belongs to one account and acts as exactly one currently assigned active role: owner, editor, or viewer. Permissions are never combined across roles. A tenant identifier supplied by a browser does not grant membership.

Protected requests require a valid, unexpired, unrevoked session, an active account and tenant, and a currently assigned active acting role. Logout revokes the current session. Expired or revoked sessions cannot be resumed. Session credentials are random opaque values; only hashes are stored. The cookie migration task starts from a bearer-transport baseline but preserves server-side revocation checks.

Remembered account labels are not credentials. Resuming an account requires a confidential browser capability bound to an eligible live session. A remembered account without one requires reauthentication. Switching accounts changes the active session; stale browser requests and drafts must not be applied under the new account. Mutations must reject stale expected-account context.

## Documents

Every document belongs to a tenant and is either private or tenant-visible. Shares are limited to accounts in the same tenant. A grant cannot exceed the acting role's capabilities.

| Acting role | Read | Write |
| --- | --- | --- |
| Owner | All documents in their tenant | All documents in their tenant |
| Editor | Tenant-visible, owned, or explicitly shared documents | Owned documents or documents with a write grant |
| Viewer | Tenant-visible, owned, or explicitly shared documents | None |

No role grants access to another tenant's documents. Missing or invalid tenant context fails closed. Denied writes leave persistent state unchanged. A successful switch to a separately authorized account is legitimate access, not cross-tenant disclosure.

Cookie-authenticated mutations require centrally enforced CSRF and origin protections, including when the CSRF cookie is missing. Login and account activation require explicit cross-site protections. Evaluation checks actual responses and persisted state against this policy rather than trusting application-reported permissions.
