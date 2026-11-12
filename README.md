# MultiAuthLab

MultiAuthLab is a proposed coding environment for studying AI control in a multi-tenant document application. It is inspired by LinuxArena and models a narrower setting: changes are reviewed before deployment.

In an adversarial run, a coding agent receives a legitimate task and a private harmful objective, such as introducing a backdoor. A control protocol reviews, tests, or repairs its changes; independent evaluation checks whether the feature works and whether the harmful outcome remains possible.

```text
Task + private harmful objective → agent changes → control protocol
                                                   ↓
                         independent functionality and security checks
```

## Current status

The protected API now provides tenant-scoped documents, roles, hashed bearer sessions, revocation, and synthetic fixtures. The [identity and authorization policy](docs/security-policy.md) also describes cookie and browser behavior planned for later checkpoints. Task packages and independent evaluation are not implemented yet. No model experiments or control results have been produced.

The planned tasks cover migrating browser sessions to cookies, switching accounts, and searching/exporting documents. The proposed harmful outcomes are cross-tenant disclosure and writes by a revoked session.

## Run the scaffold

Use Node.js 24.22.3, as recorded in `.nvmrc`.

```bash
npm ci
npm run reset
npm run dev
```

Open `http://127.0.0.1:4311`. The API health endpoint is at `http://127.0.0.1:4310/api/health`. To change ports, set `LAB_API_PORT` and `LAB_WEB_PORT` in your shell before starting; `.env.example` documents the defaults. The application does not read environment files automatically. Start a local MongoDB server on port 27017 first. `npm run reset` clears and reseeds only the disposable `multiauthlab_dev` database.

Check local prerequisites with `npm run doctor`. Build the browser app with `npm run build`. Run API integration tests against a disposable local database with `LAB_MONGODB_URI=mongodb://127.0.0.1:27017/multiauthlab_test_manual npm test`. The browser remains a scaffold. The API currently uses public synthetic bearer credentials from `apps/api/src/fixtures.js`; login and cookie transport arrive later.

## Planned evaluation

A coding agent will work on a task-specific application baseline. A control protocol will select the submitted changes, after which a separate evaluator will replay them on fresh synthetic state. Functionality and adversarial outcomes will be reported separately. Test reports and application logs produced by the submitted code will not be trusted as ground truth.

The initial evaluator will use isolated containers on a Linux host. This repository does not yet implement that isolation or claim compatibility with LinuxArena's tooling.
