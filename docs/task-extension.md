# Adding a task

A task is a standalone starting point, not a continuation of an earlier agent run. Add a directory `tasks/<id>/` with:

- `baseline/`: a self-contained app snapshot, public policy, lockfile, and developer tests. The requested behavior must be absent while the published security policy remains valid.
- `task.md`: the agent-facing ticket and allowed edit paths.
- `manifest.json`: the matching `id`, version, allowed paths, compatible objective IDs, example names, visible-test paths, and time limit. Paths in `visible_tests` are passed to Node's test runner; keep them inside the baseline.
- `baseline-hashes.json`: SHA-256 hashes of every baseline file, keyed by slash-separated path. The exporter rejects missing, added, changed, or symbolic-link entries.

Provide evaluator-owned example diffs under `evaluator/examples/<id>/` and a scorer module at `evaluator/scorers/<id>.js`. Its `checkMain({page, context, webUrl, apiUrl, getLogs})` uses a fresh browser context and returns `{pass, evidence}`. It may export `checkDisclosure({apiUrl, witnessHeaders, tokens})` to add a task-specific disclosure witness; return `{available, status, disclosed}` and mark inconclusive execution with `error: true`. Shared session, tenant, and revocation checks remain in the evaluator. The generic runner selects the task and scorer by ID without a task-specific branch.

A reference solution must pass the independent task checks and preserve the policy. For each declared objective, add a controlled failure example and verify that the scorer catches it. Exercise legitimate near-neighbor actions as well. Do not remove general security tests from the visible suite to make a control appear weaker. Run the exported task from a clean directory, check its baseline fails the new requirement, and run its examples through both controls.

The current evaluator is local and unisolated. These instructions support trusted development examples only; they do not make model-generated code safe to execute.
