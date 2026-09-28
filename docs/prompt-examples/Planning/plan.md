# Technical Implementation Plan

**Feature:** CM-830 — Trust-Manager Integration as Operand in cert-manager-operator

## 0. Inputs acknowledged

| Input | Status |
|-------|--------|
| Spec source | CM-830 (trust-manager integration — 14 FRs, 4 user stories, 6 success criteria) |
| Repo assessment pin | https://github.com/openshift/cert-manager-operator, branch master, commit HEAD (tooling_status: ACTIVE, working-folder mode) |
| `agents.md` | PROVIDED — `openspec/inputs/agents.md` (554 lines, concrete agent IDs and routing) |
| `spec_validator_results.json` | PROVIDED — validation.json (score 56, NEEDS_REVISION, approved) |
| `constitution.md` | PROVIDED — `openspec/inputs/constitution.md` (AgentRoutingMode: PROVIDED) |

**AgentRoutingMode:** PROVIDED (from constitution.md)

## 1. Architectural strategy

### Feature Integration

Trust-manager will be integrated as the **second addon operand** in cert-manager-operator, following the established IstioCSR addon pattern. The integration adds:

1. A new **cluster-scoped singleton CRD** (`TrustManager`) in `operator.openshift.io/v1alpha1` for operator-level configuration of the trust-manager operand.
2. A new **controller-runtime reconciler** (`pkg/controller/trustmanager/`) that deploys and manages the trust-manager operand from embedded bindata manifests.
3. A new **TechPreview feature gate** (`FeatureTrustManager`) gated behind both the operator feature gate AND OpenShift cluster FeatureSet (`TechPreviewNoUpgrade`/`CustomNoUpgrade`/`DevPreviewNoUpgrade`).
4. Upstream trust-manager operand manifests vendored via helm template into `bindata/trust-manager/resources/`.

The trust-manager operand itself provides the `Bundle` CRD (cluster-scoped, `trust.cert-manager.io/v1alpha1`) which handles distributing CA trust bundles to namespaces. The operator does NOT implement trust bundle distribution logic — it deploys the upstream trust-manager which provides that capability.

### Repo-grounded reality check

Per repo-assessment §0 and §11.1: **trust-manager is completely absent on this branch.** No types, no controller, no bindata, no feature gate, no CRD, no tests exist. This is a **greenfield implementation** that must follow the IstioCSR addon pattern documented in repo-assessment §9.4 and agents.md "Adding a New Addon Controller" section.

Key pattern reference: `pkg/controller/istiocsr/` (22 files, controller-runtime reconciler, create-or-update with deep equality, feature-gated startup).

**agents.md prescribes SSA** (`client.Apply`) for new addons and references `pkg/controller/common/` — however, repo-assessment §11.1 confirms this package does NOT exist on the branch. The plan must address this gap: either create `pkg/controller/common/` or follow the existing IstioCSR create-or-update approach.

### Decision: SSA vs Create-or-Update

Per agents.md common mistakes: "Do NOT use create-or-update — use SSA (`client.Apply`)". However, `pkg/controller/common/` with `NewClient`, `HandleReconcileResult`, `DecodeObjBytes`, etc. does not exist. Two options:

1. **Create `pkg/controller/common/`** as described in agents.md, then build trust-manager on top of it.
2. **Follow existing IstioCSR pattern** (create-or-update) for initial TechPreview, refactor to SSA later.

This plan follows **Option 1** (create common package first) as agents.md is authoritative and this avoids tech debt from day one. The common package is scoped to what trust-manager needs; IstioCSR migration to common is out of scope.

## 2. Persistence & state

### Kubernetes objects

| Object | Scope | Role | Source of truth |
|--------|-------|------|-----------------|
| `TrustManager` CR | Cluster-scoped, singleton `cluster` | Operator-level config for trust-manager operand | User-created (opt-in) |
| `Bundle` CRD/CRs | Cluster-scoped (upstream) | Trust bundle distribution (source → target) | Installed by operator from bindata; instances created by users |
| Trust-manager Deployment | Namespaced (`cert-manager`) | Operand workload | Reconciled from bindata by controller |
| Trust-manager ServiceAccount | Namespaced | Operand identity | Reconciled from bindata |
| Trust-manager RBAC | Cluster + Namespaced | Operand permissions (including dynamic secret access) | Reconciled from bindata; dynamically scoped per TrustManager CR |
| Trust-manager webhook resources | Namespaced | Validation webhook for Bundle CRs | Reconciled from bindata |

### Operand config/state

- Trust-manager deployment args derived from `TrustManager` CR spec fields (log level, log format, trust namespace, filter expired certs, default package)
- Secret targets RBAC dynamically scoped: when `secretTargets.enabled=true`, additional ClusterRole rules are applied based on `authorizedSecrets` list or `authorizedSecretsAll` flag
- Image resolved from `RELATED_IMAGE_CERT_MANAGER_TRUSTMANAGER` env var (OLM/CSV injection)

### External/platform-injected state

- OpenShift FeatureSet discovered from `featuregates.config.openshift.io/cluster` (controls whether TechPreview feature gate passes)
- No CNO-injected CA bundles needed for trust-manager itself (it IS the CA bundle distribution tool)

## 3. Interfaces & contracts (operator-native)

### 3.1 Kubernetes APIs (CRDs/CRs)

**New CRD: `TrustManager`** (`operator.openshift.io/v1alpha1`)

| Field | Type | Validation | Purpose |
|-------|------|------------|---------|
| `metadata.name` | string | CEL: `self.metadata.name == 'cluster'` | Singleton enforcement |
| `spec.trustManager.logLevel` | int | Enum: 1-5 | Operand log verbosity |
| `spec.trustManager.logFormat` | string | Enum: text/json | Log format |
| `spec.trustManager.trustNamespace` | string | Optional, default `cert-manager` | Source namespace for ConfigMaps/Secrets |
| `spec.trustManager.filterExpiredCertificates` | Enabled/Disabled | Enum | Whether to exclude expired certs |
| `spec.trustManager.secretTargets.enabled` | Enabled/Disabled | Enum | Enable Secret-based bundle targets |
| `spec.trustManager.secretTargets.authorizedSecretsAll` | Enabled/Disabled | Enum, conditional | Global secret write permission |
| `spec.trustManager.secretTargets.authorizedSecrets` | []string | Optional | Per-name secret authorization |
| `spec.controllerConfig.labels` | map[string]string | Optional | Custom labels on operand resources |
| `spec.controllerConfig.annotations` | map[string]string | Optional | Custom annotations |
| `status` | TrustManagerStatus | - | Embeds `ConditionalStatus`, observed image/version |

**Immutability:** `trustNamespace` is immutable after creation (CEL `oldSelf == '' || self == oldSelf`).

**Upstream CRD: `Bundle`** (`trust.cert-manager.io/v1alpha1`) — installed from bindata, not defined by operator. No operator code reconciles Bundle CRs — trust-manager operand does.

### 3.2 Controller/runtime interfaces (internal)

**New packages:**

| Package | Purpose |
|---------|---------|
| `pkg/controller/common/` | Shared SSA client, error classification, reconcile result handler, decode helpers |
| `pkg/controller/trustmanager/` | TrustManager reconciler — install/uninstall operand based on CR |

**Reconciler contract:**
- `Reconciler` struct embedding `common.CtrlClient` + ctx/log/eventRecorder/scheme
- `New(mgr)` constructor
- `SetupWithManager(mgr)` with watches on TrustManager CR + managed resources (label-filtered)
- `Reconcile()`: fetch CR → deletion? cleanup : addFinalizer + install sequence
- Status: `Ready`/`Degraded` conditions via `common.HandleReconcileResult()`

**Install sequence** (ordered):
1. `validateConfig` — reject invalid spec fields (IrrecoverableError)
2. `createOrApplyServiceAccounts`
3. `createOrApplyRBACResources` — base RBAC + dynamic secret RBAC based on CR
4. `createOrApplyServices`
5. `createOrApplyWebhookResources` — webhook Deployment + Service + cert-manager Certificate
6. `createOrApplyDeployments` — trust-manager controller Deployment
7. `updateStatusObservedState`

### 3.3 Webhooks / admission (if applicable)

N/A — The `TrustManager` CR uses CEL validation rules only (per constitution.md Principle XII: "No admission/conversion webhooks"). The trust-manager operand itself ships a validating webhook for `Bundle` CRs, but that webhook is managed by the operand (bindata), not the operator controller.

### 3.4 RBAC / security boundaries (if applicable)

**Operator RBAC** (kubebuilder markers on reconciler):
- `trustmanagers` — get, list, watch, patch, update
- `trustmanagers/status` — get, patch, update
- `trustmanagers/finalizers` — update
- Deployments, Services, ServiceAccounts, ConfigMaps, Secrets (metadata-only), NetworkPolicies — get, list, watch, create, patch, update, delete
- ClusterRoles, ClusterRoleBindings, Roles, RoleBindings — get, list, watch, create, patch, update, delete
- Certificates (cert-manager) — get, list, watch, create, patch, update, delete

**Operand RBAC** (from bindata, applied by controller):
- Base: configmaps (read), namespaces (read), tokenreviews, events — for trust bundle reconciliation
- Dynamic (when secretTargets.enabled):
  - `authorizedSecretsAll=true`: secrets (get, list, watch, create, update, patch) — all namespaces
  - `authorizedSecrets=[name1, name2]`: ResourceNames-scoped secrets access
  - When secretTargets disabled: only secret read in trust namespace (for sources)

**Blast radius justification:** Secret access is explicitly gated behind user opt-in (`secretTargets.enabled`) with fine-grained control. Cluster-wide secret access only with `authorizedSecretsAll=true` which requires explicit user action.

### 3.5 Packaging / OLM (if applicable)

- **Owned CRD:** `trustmanagers.operator.openshift.io` added to CSV
- **Upstream CRD:** `bundles.trust.cert-manager.io` installed from bindata (not CSV-owned — owned by the operand)
- **Environment variables:** `RELATED_IMAGE_CERT_MANAGER_TRUSTMANAGER`, `TRUSTMANAGER_OPERAND_IMAGE_VERSION`
- **relatedImages:** trust-manager image added to CSV
- **Feature gate:** TechPreview — requires `featuregates.config.openshift.io` cluster FeatureSet
- **Sample CR:** `config/samples/tech-preview/operator_v1alpha1_trustmanager.yaml`

## 4. Dependencies & sequencing graph

### Critical path

```
API Types → Codegen → Common Package → Controller → Operator Wiring → RBAC → OLM → Tests → Docs
```

### Parallelizable workstreams

| Stream A (API + Common) | Stream B (Bindata) | Stream C (Tests - after A+B) |
|---|---|---|
| TrustManager types | helm script + manifest generation | Unit tests |
| Feature gate definition | Bindata go-bindata | E2E tests |
| Common package | CRD (Bundle) from upstream | |
| Deepcopy + CRD generation | | |

### Explicit blockers

- **No external cross-repo blockers** — trust-manager upstream helm charts are publicly available
- **Internal dependency:** Common package must exist before controller implementation (if following SSA)
- **Platform dependency:** trust-manager image must be available in OpenShift image registry for e2e

## 5. Implementation phases (logical sequence; NOT tasks)

### Phase 1: API Types & Feature Gate

- **Goal:** Define the `TrustManager` CRD type, list type, feature gate registration, and generate deepcopy/CRD manifests. Establish the API contract for the operand configuration.
- **Dependencies:** None — this is the foundation.
- **Target files:**
  - `api/operator/v1alpha1/trustmanager_types.go` (NEW)
  - `api/operator/v1alpha1/features.go` (MODIFY — add `FeatureTrustManager`)
  - `api/operator/v1alpha1/zz_generated.deepcopy.go` (REGENERATED)
  - `config/crd/bases/operator.openshift.io_trustmanagers.yaml` (GENERATED)
- **Required capabilities:** API_Agent
- **Verification hooks:** `make generate && make manifests && make verify && go build ./...`

### Phase 2: Bindata / Manifest Generation

- **Goal:** Create the helm-to-bindata pipeline for trust-manager and generate static operand manifests (Deployment, ServiceAccount, RBAC, webhook resources, Bundle CRD).
- **Dependencies:** None — can proceed in parallel with Phase 1.
- **Target files:**
  - `hack/update-trust-manager-manifests.sh` (NEW)
  - `bindata/trust-manager/resources/` (NEW — generated manifests)
  - `config/crd/bases/` (NEW — Bundle CRD from upstream)
  - `Makefile` (MODIFY — add `TRUST_MANAGER_VERSION`, update `update-manifests` target)
- **Required capabilities:** ManifestsBindata_Agent
- **Verification hooks:** `make update-manifests && make update-bindata && make verify`

### Phase 3: Common Package

- **Goal:** Create `pkg/controller/common/` with shared SSA client, error classification, reconcile result handler, decode helpers, and validation utilities as prescribed by agents.md.
- **Dependencies:** Must wait for Phase 1 (types referenced in status handling).
- **Target files:**
  - `pkg/controller/common/client.go` (NEW)
  - `pkg/controller/common/errors.go` (NEW)
  - `pkg/controller/common/reconcile_result.go` (NEW)
  - `pkg/controller/common/utils.go` (NEW)
  - `pkg/controller/common/validation.go` (NEW)
  - `pkg/controller/common/constants.go` (NEW)
  - `pkg/controller/common/fakes/fake_ctrl_client.go` (NEW — counterfeiter)
- **Required capabilities:** OperatorController_Agent
- **Verification hooks:** `go build ./pkg/controller/common/... && go vet ./pkg/controller/common/...`

### Phase 4: Controller Implementation

- **Goal:** Implement the trust-manager reconciler with full install/uninstall sequence, status management, and SSA-based resource application using the common package.
- **Dependencies:** Must wait for Phase 1 (types), Phase 2 (bindata), Phase 3 (common package).
- **Target files:**
  - `pkg/controller/trustmanager/controller.go` (NEW)
  - `pkg/controller/trustmanager/install_trustmanager.go` (NEW)
  - `pkg/controller/trustmanager/constants.go` (NEW)
  - `pkg/controller/trustmanager/deployments.go` (NEW)
  - `pkg/controller/trustmanager/rbacs.go` (NEW)
  - `pkg/controller/trustmanager/services.go` (NEW)
  - `pkg/controller/trustmanager/serviceaccounts.go` (NEW)
  - `pkg/controller/trustmanager/webhooks.go` (NEW)
  - `pkg/controller/trustmanager/utils.go` (NEW)
  - `pkg/controller/trustmanager/test_utils.go` (NEW)
- **Required capabilities:** OperatorController_Agent
- **Verification hooks:** `go build ./pkg/controller/trustmanager/... && go vet ./pkg/controller/trustmanager/... && make test`

### Phase 5: Operator Wiring & Feature Gate Integration

- **Goal:** Wire the trust-manager controller into the unified manager in `setup_manager.go`, add TechPreview feature gate check in `starter.go`, register cache configuration.
- **Dependencies:** Must wait for Phase 4 (controller exists to wire).
- **Target files:**
  - `pkg/operator/setup_manager.go` (MODIFY — add trust-manager reconciler registration)
  - `pkg/operator/starter.go` (MODIFY — add TechPreview feature gate check)
  - `pkg/features/features.go` (MODIFY — add TechPreview gating with cluster FeatureSet discovery)
- **Required capabilities:** OperatorController_Agent
- **Verification hooks:** `go build ./... && make test`

### Phase 6: RBAC & Security

- **Goal:** Add kubebuilder RBAC markers on the trust-manager reconciler, ensure operand RBAC manifests in bindata are correct, add dynamic RBAC logic for secret targets.
- **Dependencies:** Must wait for Phase 4 (controller with markers) and Phase 2 (bindata RBAC manifests).
- **Target files:**
  - `pkg/controller/trustmanager/controller.go` (MODIFY — add kubebuilder RBAC markers)
  - `config/rbac/role.yaml` (REGENERATED via `make manifests`)
  - `bindata/trust-manager/resources/` (VERIFY — operand RBAC manifests correct)
- **Required capabilities:** RBACSecurity_Agent
- **Verification hooks:** `make manifests && make verify`

### Phase 7: OLM Packaging & Bundle

- **Goal:** Update the OLM bundle with the new TrustManager CRD ownership, environment variables, relatedImages, and sample CR.
- **Dependencies:** Must wait for Phase 1 (CRD), Phase 5 (wiring complete), Phase 6 (RBAC).
- **Target files:**
  - `bundle/manifests/cert-manager-operator.clusterserviceversion.yaml` (REGENERATED)
  - `bundle/manifests/operator.openshift.io_trustmanagers.yaml` (NEW — CRD in bundle)
  - `config/samples/tech-preview/operator_v1alpha1_trustmanager.yaml` (NEW)
  - `Makefile` (MODIFY — add RELATED_IMAGE + version env vars to local-run)
- **Required capabilities:** OLMRelease_Agent
- **Verification hooks:** `make bundle && hack/verify-bundle.sh`

### Phase 8: Unit & Integration Testing

- **Goal:** Write comprehensive unit tests for the trust-manager controller (per reconciler file) using counterfeiter fakes and table-driven tests.
- **Dependencies:** Must wait for Phase 4 (controller logic to test).
- **Target files:**
  - `pkg/controller/trustmanager/*_test.go` (NEW — one per reconciler file)
  - `pkg/controller/common/*_test.go` (NEW — common package tests)
  - `pkg/controller/trustmanager/fakes/` (NEW — counterfeiter fakes)
- **Required capabilities:** OperatorController_Agent (co-generated with controller)
- **Verification hooks:** `make test`

### Phase 9: E2E Testing

- **Goal:** Write end-to-end tests validating the full trust-manager lifecycle: enable feature gate, create TrustManager CR, verify operand deployment, create Bundle CR, verify trust bundle distribution.
- **Dependencies:** Must wait for Phase 5 (wiring complete), requires running cluster with operator deployed.
- **Target files:**
  - `test/e2e/trust_manager_test.go` (NEW)
  - `test/e2e/testdata/trust-manager/` (NEW — test fixtures)
- **Required capabilities:** Testing_Agent
- **Verification hooks:** `E2E_GINKGO_LABEL_FILTER="Feature:TrustManager" make test-e2e`

### Phase 10: Documentation

- **Goal:** Update README and docs to cover trust-manager operand enablement, configuration, and usage.
- **Dependencies:** Must wait for Phase 7 (packaging finalized).
- **Target files:**
  - `README.md` (MODIFY — add trust-manager section)
  - `docs/trust-manager.md` (NEW — user guide)
- **Required capabilities:** Docs_Agent
- **Verification hooks:** Manual review

## 6. Verification matrix (maps to spec acceptance)

| Category | Coverage | Files / Suites | Maps to |
|----------|----------|----------------|---------|
| Unit | Controller reconcile logic, install sequence, config validation, status updates, error handling, dynamic RBAC | `pkg/controller/trustmanager/*_test.go`, `pkg/controller/common/*_test.go` | FR-001–FR-014 (logic paths) |
| Unit | API type defaults, CEL validation, deepcopy | `make test-apis` (if available) or `api/operator/v1alpha1/tests/` | FR-001, FR-003 |
| Integration | Feature gate wiring, manager startup, cache filtering | `make test` (envtest) | FR-001, FR-014 |
| E2E | Full lifecycle: enable → create CR → operand Ready → Bundle distribution → disable → cleanup | `test/e2e/trust_manager_test.go` | SC-001–SC-006, FR-002–FR-013 |
| E2E | Secret targets: enable → authorize → verify Secret creation → reject unauthorized | `test/e2e/trust_manager_test.go` | FR-008, FR-009, SC-006 |
| E2E | TechPreview gating: reject CR without correct FeatureSet | `test/e2e/trust_manager_test.go` | FR-003, FR-014 |
| CI | Codegen consistency, bundle verification, lint | `make verify && make lint` | All (build hygiene) |
| Manual | Disconnected install, image mirroring | Cluster deployment test | A-010 |

## 7. Risks, migrations, and operational follow-ups

### `pkg/controller/common/` creation risk
Creating the common package is prescribed by agents.md but has no existing implementation to reference. Risk: incorrect abstraction, or abstractions that don't match future IstioCSR migration needs. **Mitigation:** Scope common/ to exactly what trust-manager needs; document intended IstioCSR migration as future work.

### SSA adoption without reference
No existing controller in this repo uses SSA. Trust-manager will be the first adopter. Risk: unexpected SSA field ownership conflicts with existing resources or future migrations. **Mitigation:** Use a unique `fieldOwner` string (`trust-manager-controller`); test SSA behavior thoroughly in unit tests with real API server (envtest).

### Upstream Bundle → ClusterBundle migration
Trust-manager upstream is deprecating `Bundle` (v1alpha1) in favor of `ClusterBundle` (v1alpha2). Risk: API breaking change after initial release. **Mitigation:** Ship with Bundle v1alpha1 for TechPreview; plan CRD migration tooling for GA. Document risk in operator release notes.

### Feature gate fails closed
TechPreview feature gates that cannot discover `featuregates.config.openshift.io/cluster` silently reject the CR. Risk: confusing UX on non-standard clusters. **Mitigation:** Set a clear `Degraded` condition with message explaining FeatureSet requirement.

### Dynamic RBAC for secret targets
Creating/deleting ClusterRoles based on CR spec changes introduces RBAC lifecycle complexity. Risk: orphaned RBAC resources on CR deletion. **Mitigation:** Use finalizer to clean up dynamic RBAC; test cleanup thoroughly in e2e.

### Upgrade / migration
- **From clusters without trust-manager:** No migration needed — opt-in via CR creation (per spec A-005).
- **Operator upgrade with existing TrustManager CR:** Reconciler should handle operand version bumps gracefully (image env var update → rolling restart).
- **Compatibility:** OpenShift 4.x with TechPreview FeatureSet only. MicroShift/Hypershift out of scope (per spec).

## 8. Open questions / SME decisions

| # | Question | Owner | Default assumption if no answer |
|---|----------|-------|--------------------------------|
| 1 | Should `defaultCAs` (upstream public trust bundle from OS packages) be exposed as a TrustManager CR field, or entirely hidden for OpenShift? | Product/SME | Hidden — not exposed in CR; can be enabled via unsupportedConfigOverrides if needed (per spec A-008 NEEDS CLARIFICATION) |
| 2 | Trust-manager operand namespace — deploy in `cert-manager` (same as core operand) or separate namespace? | Architecture/SME | Deploy in `cert-manager` namespace (matches IstioCSR pattern — addon deploys in operand namespace) |
| 3 | Should the operator install the upstream `Bundle` CRD from bindata, or rely on OLM to install it from the bundle? | Architecture/SME | Operator installs from bindata (matches cert-manager CRD handling pattern — operand CRDs in bindata, installed by controller) |
| 4 | Scope of `pkg/controller/common/`: minimum for trust-manager only, or design for future IstioCSR migration? | Architecture | Minimum for trust-manager with documented extension points; IstioCSR migration is separate future work |
| 5 | Should trust-manager network policies be added to `bindata/networkpolicies/`? | Security/SME | Yes, follow cert-manager/istio-csr pattern — default deny + explicit allow (per constitution Principle X) |
