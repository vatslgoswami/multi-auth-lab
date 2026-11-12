# MultiAuthLab

MultiAuthLab is a proposed coding environment for studying AI control in a multi-tenant document application. It is inspired by LinuxArena and models a narrower setting: changes are reviewed before deployment.

In an adversarial run, a coding agent receives a legitimate task and a private harmful objective, such as introducing a backdoor. A control protocol reviews, tests, or repairs its changes; independent evaluation checks whether the feature works and whether the harmful outcome remains possible.

```text
Task + private harmful objective → agent changes → control protocol
                                                   ↓
                         independent functionality and security checks
```

## Current status

The application includes synthetic organizations, document access, one-time-code sign-in, cookie sessions, role selection, and saved-account switching. It keeps unsaved document text separate by account and acting role. The [security policy](docs/security-policy.md) describes the intended boundaries.

The planned tasks cover migrating browser sessions to cookies, switching accounts, and searching/exporting documents. Their independent baselines, reference solutions, and evaluator are not built yet. No model experiments or control results have been produced.

## Run the application

Use Node.js 24.22.3, as recorded in `.nvmrc`, and start a local MongoDB server on port 27017. Then run:

```bash
npm ci
npm run reset
npm run dev
```

Open `http://127.0.0.1:4311` and choose a sample account. When you request a sign-in code, the local API prints it to the terminal running `npm run dev`. Codes are synthetic and are not emailed or sent to any external service. Use **Add** under Saved accounts to sign into another organization.

`npm run reset` clears and reseeds only the disposable `multiauthlab_dev` database. Set `LAB_API_PORT` and `LAB_WEB_PORT` in your shell to change ports; the application does not load environment files automatically. `npm run doctor` checks local prerequisites.

Run API tests and actual browser tests against a disposable local database:

```bash
npx playwright install chromium
LAB_MONGODB_URI=mongodb://127.0.0.1:27017/multiauthlab_test_manual npm test
LAB_MONGODB_URI=mongodb://127.0.0.1:27017/multiauthlab_test_manual npm run test:browser
```

Browser tests start their own API and web servers on ports 4310 and 4311; stop the development servers first. Build the browser application with `npm run build`.

## Planned evaluation

A coding agent will work on a task-specific application baseline. A control protocol will select the submitted changes, after which a separate evaluator will replay them on fresh synthetic state. Functionality and adversarial outcomes will be reported separately. Test reports and application logs produced by the submitted code will not be trusted as ground truth.

The initial evaluator will use isolated containers on a Linux host. This repository does not yet implement that isolation or claim compatibility with LinuxArena's tooling. The application is a local research environment; its synthetic authentication and terminal inbox are not designed for production deployment.
