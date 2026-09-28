# Repo Assessment Report: cert-manager-operator

## §0 Metadata

| Field | Value |
|-------|-------|
| Repository | https://github.com/openshift/cert-manager-operator |
| Branch | master (working-folder mode — local checkout) |
| Commit | HEAD (local) |
| Tooling Status | ACTIVE — all files read from working directory |
| Spec Status | PASS (validation.json overall_score 56, NEEDS_REVISION but approved) |
| Feature | CM-830: Integrate trust-manager as operand in cert-manager-operator |
| Greenfield | YES — trust-manager code does NOT exist on this branch |

## §1 Architecture Overview

### §1.1 High-Level Architecture

The cert-manager-operator uses a **dual-controller architecture**:

1. **Core cert-manager operand** — managed by **library-go** factory controllers (`StaticResourceController`, `DeploymentController`) wired through `CertManagerControllerSet` in `pkg/controller/deployment/`. This deploys cert-manager controller, webhook, and cainjector from vendored manifests in `bindata/cert-manager-deployment/`.

2. **Addon operands** — managed by **controller-runtime** reconcilers registered on a single shared `ctrl.Manager` in `pkg/operator/setup_manager.go`. Currently only IstioCSR is implemented (`pkg/controller/istiocsr/`). Trust-manager will follow this pattern.

**Bootstrap sequence** (`pkg/operator/starter.go` → `RunOperator()`):
1. Create kube, operator, apiextensions clients
2. Build `CertManagerControllerSet` (8 library-go controllers for core operand)
3. Start `DefaultCertManagerController` (auto-creates singleton `CertManager` CR named `cluster`)
4. Start all informers + library-go controllers
5. Parse feature gates from `--unsupported-addon-features` flag
6. If `FeatureIstioCSR` enabled → `NewControllerManager().Start()` (controller-runtime manager)

### §1.2 Namespace Model

| Namespace | Purpose |
|-----------|---------|
| `cert-manager-operator` | Operator deployment, leader election, operator ServiceAccount |
| `cert-manager` | Operand namespace (controller, webhook, cainjector, istio-csr). Hardcoded in `pkg/operator/operatorclient/`. |

Both namespaces are hardcoded — no dynamic namespace discovery.

### §1.3 Dead Code / Do-Not-Edit Traps

- **`pkg/controller/deployment/certmanager_controller.go`** — Dead RBAC placeholder. Contains an empty `Reconcile()` that returns immediately. Exists solely to carry `+kubebuilder:rbac` markers for code generation. **Do NOT add reconciliation logic here.**
- **`config.openshift.io_certmanagers.yaml`** — Empty stub CRD (untyped spec/status). NOT bundled, NOT installed, NO controller code. RBAC exists but is unused. **Do NOT implement a controller for this CRD.**
- **`zz_generated.deepcopy.go`**, **`pkg/operator/{clientset,informers,listers}/`** — Code-generated. Never hand-edit.
- **`vendor/`** — Vendored. Never edit directly; use `make update-vendor`.
- **`bindata/`** — Generated from upstream helm charts via `hack/update-*-manifests.sh`. Long-term edits will be overwritten. Use the update scripts.

### §1.4 Trust-Manager on This Branch

**NOT PRESENT.** Zero trust-manager code, types, CRDs, bindata, or feature gates exist on this branch. Implementation is **greenfield** following the IstioCSR addon pattern:
- Controller-runtime reconciler
- Cluster-scoped singleton CR (name `cluster` per agents.md — differs from IstioCSR's namespaced `default`)
- Bindata manifests from upstream helm charts
- Feature gate gated behind TechPreview + OpenShift featureSet

## §2 Key Source Files

### API Types

| Path | Purpose | Notes |
|------|---------|-------|
| `api/operator/v1alpha1/certmanager_types.go` | `CertManager` CR — cluster-scoped, singleton `cluster`, embeds `operatorv1.OperatorSpec` | Core operand configuration |
| `api/operator/v1alpha1/istiocsr_types.go` | `IstioCSR` CR — namespaced, singleton `default`, domain-specific spec | **Addon pattern to follow** |
| `api/operator/v1alpha1/features.go` | Feature gate definitions (`FeatureIstioCSR` only) | Add `FeatureTrustManager` here |
| `api/operator/v1alpha1/conditions.go` | `Ready`/`Degraded` condition helpers | Reuse for trust-manager status |
| `api/operator/v1alpha1/meta.go` | `Mode`, `ConfigMapReference`, `ConditionalStatus` | Shared types for addon CRs |
| `api/operator/v1alpha1/groupversion_info.go` | `operator.openshift.io/v1alpha1` scheme registration | Register new types via `init()` in types file |

### Controllers

| Path | Purpose | Notes |
|------|---------|-------|
| `pkg/controller/istiocsr/controller.go` | IstioCSR reconciler (336 lines) — **primary addon pattern** | Follow for trust-manager controller |
| `pkg/controller/istiocsr/install_istiocsr.go` | Ordered install sequence | Follow sequence pattern |
| `pkg/controller/istiocsr/constants.go` | Labels, env vars, asset names | Mirror for trust-manager |
| `pkg/controller/istiocsr/errors.go` | `IrrecoverableError`, `RetryRequiredError`, `FromClientError` | Reuse error types |
| `pkg/controller/istiocsr/deployments.go` | Deployment reconcile with args, volumes, CA | Pattern for trust-manager deployment |
| `pkg/controller/deployment/cert_manager_controller_set.go` | 8 library-go controllers | **Do NOT follow for addons** |
| `pkg/controller/deployment/certmanager_controller.go` | **DEAD CODE** — RBAC placeholder only | **Do NOT edit** |

### Operator Wiring

| Path | Purpose | Notes |
|------|---------|-------|
| `pkg/operator/setup_manager.go` | Single `ctrl.Manager` for addons — currently IstioCSR only | Wire trust-manager controller here |
| `pkg/operator/starter.go` | Entry point, feature gate → manager start | Add trust-manager feature gate check |
| `pkg/features/features.go` | Runtime feature gate parsing + cluster FeatureSet discovery | TechPreview gating logic lives here |
| `pkg/cmd/operator/cmd.go` | Cobra CLI, flags | `--unsupported-addon-features` |

### Bindata

| Path | Purpose | Notes |
|------|---------|-------|
| `bindata/cert-manager-deployment/` | Core operand manifests (controller, webhook, cainjector) | DO NOT use as pattern for addons |
| `bindata/istio-csr/` | 11 IstioCSR operand manifests | **Pattern for trust-manager bindata** |
| `bindata/networkpolicies/` | Network policies for cert-manager + istio-csr | Add trust-manager NPs if needed |

### Configuration & Build

| Path | Purpose | Notes |
|------|---------|-------|
| `config/crd/bases/` | Generated CRD YAML | Add trust-manager CRD here via `make manifests` |
| `config/rbac/role.yaml` | Operator manager-role ClusterRole | Auto-updated from kubebuilder markers |
| `Makefile` | Build, test, verify, codegen targets | Add `TRUST_MANAGER_VERSION`, update targets |
| `hack/update-istio-csr-manifests.sh` | Helm → yq → split manifests for IstioCSR | Template for `hack/update-trust-manager-manifests.sh` |
| `.golangci.yaml` | Linter config | Build tag `e2e`, vendor mode, local-prefixes |

### Tests

| Path | Purpose | Notes |
|------|---------|-------|
| `test/e2e/istio_csr_test.go` | IstioCSR e2e (880 lines, `Feature:IstioCSR` label) | Pattern for trust-manager e2e |
| `test/e2e/suite_test.go` | Ginkgo suite setup, client creation | Extend for trust-manager clients |
| `pkg/controller/istiocsr/*_test.go` | Unit tests using counterfeiter fakes | Pattern for trust-manager unit tests |

## §3 Dependency Summary

| Dependency | Version | Use |
|------------|---------|-----|
| `sigs.k8s.io/controller-runtime` | v0.19.0 | Addon controller framework |
| `github.com/openshift/library-go` | v0.0.0-20251029 | Core operand controllers |
| `github.com/openshift/api` | v0.0.0-20250710 | OpenShift API types (`operatorv1.OperatorSpec`) |
| `github.com/cert-manager/cert-manager` | v1.18.4 (OpenShift fork) | cert-manager API types (Certificate, Issuer) |
| `k8s.io/client-go` | v0.33.2 | Kubernetes clients |
| `github.com/onsi/ginkgo/v2` | v2.21.0 | E2E test framework |
| `github.com/onsi/gomega` | v1.35.1 | E2E assertions |
| `github.com/stretchr/testify` | v1.10.0 | Unit test assertions |
| `github.com/maxbrunsfeld/counterfeiter/v6` | v6.8.1 | Fake client generation |
| Go | 1.24.4 | `go.mod` directive |

## §4 Configuration & Reconciliation

### §4.1 Configuration Surface

**CertManager CR** (cluster-scoped, singleton `cluster`):

| Field | Type | Purpose |
|-------|------|---------|
| `spec.managementState` | Managed/Unmanaged/Removed | Operator lifecycle (from `operatorv1.OperatorSpec`) |
| `spec.logLevel` | string | Operator log level |
| `spec.unsupportedConfigOverrides` | runtime.RawExtension | Escape hatch |
| `spec.controllerConfig` | ComponentConfig | Controller overrides (args, env, labels, resources, replicas, scheduling) |
| `spec.webhookConfig` | ComponentConfig | Webhook overrides |
| `spec.cainjectorConfig` | ComponentConfig | CAInjector overrides |
| `spec.defaultNetworkPolicy` | Default/None | Whether default deny NPs are applied |
| `spec.networkPolicies` | []NetworkPolicy | User-defined NPs |

**IstioCSR CR** (namespaced, singleton `default`) — addon pattern reference:

| Field | Type | Purpose |
|-------|------|---------|
| `spec.istioCSR.logLevel` | int | Operand log verbosity (1-5) |
| `spec.istioCSR.logFormat` | text/json | Log format |
| `spec.istioCSR.certManager.issuerRef` | IssuerRef | Certificate issuer (immutable) |
| `spec.istioCSR.istiod.tls` | IstiodTLSConfig | TLS config for istiod cert |
| `spec.istioCSR.istiod.privateKeyAlgorithm` | string | Key algorithm (immutable) |
| `spec.istioCSR.istiod.privateKeySize` | int | Key size (immutable) |
| `spec.istioCSR.server.maxCertificateDuration` | Duration | Max cert TTL |
| `spec.istioCSR.server.servingCertificateDuration` | Duration | Serving cert TTL |
| `spec.istioCSR.server.servingCertificateKeySize` | int | Serving key size |
| `spec.istioCSR.server.port` | int | gRPC port (immutable) |
| `spec.istioCSR.istio.namespace` | string | Istio control plane namespace (immutable) |
| `spec.istioCSR.istio.revisions` | []string | Istio revisions |
| `spec.controllerConfig.scheduling` | SchedulingConfig | Node selector + tolerations |

**Operator runtime flags** (`pkg/cmd/operator/cmd.go`):
- `--trusted-ca-configmap` — CNO-injected CA ConfigMap name
- `--cloud-credentials-secret` — Cloud credential secret name
- `--unsupported-addon-features` — Override feature gates (e.g., `IstioCSR=false`)

### §4.2 Reconciliation Hooks / Pipelines

**Core cert-manager deployment hooks** (from `generic_deployment_controller.go`):

| # | Hook | Purpose | On Error |
|---|------|---------|----------|
| 1 | `withOperandImageOverrideHook` | RELATED_IMAGE env var substitution | Falls back to manifest default |
| 2 | `withLogLevel` | Sets `--v=N` from CertManager CR logLevel | Ignored if unset |
| 3 | `withPodLabelsOverrideHook` | Applies user-specified pod labels | Validation rejects invalid |
| 4 | `withPodLabelsValidateHook` | Validates label format | Rejects with error condition |
| 5 | `withContainerArgsOverrideHook` | Merges allowlisted args | Only allowlisted args pass |
| 6 | `withContainerArgsValidateHook` | Validates against allowlist | Rejects disallowed args |
| 7 | `withContainerEnvOverrideHook` | Merges allowlisted env vars | Only allowlisted env vars pass |
| 8 | `withContainerEnvValidateHook` | Validates against env allowlist | Rejects disallowed vars |
| 9 | `withDeploymentReplicasOverrideHook` | Replica count override | Falls back to default |
| 10 | `withContainerResourcesOverrideHook` | CPU/memory resource override | Falls back to manifest default |
| 11 | `withContainerResourcesValidateHook` | Validates resource format | Rejects invalid |
| 12 | `withPodSchedulingOverrideHook` | Node selector + tolerations | Falls back to default |
| 13 | `withPodSchedulingValidateHook` | Validates scheduling format | Rejects invalid |
| 14 | `withUnsupportedArgsOverrideHook` | Escape hatch override | No validation |
| 15 | `withProxyEnv` | OLM-injected proxy env propagation | No-op if unset |
| 16 | `withCAConfigMap` | Mounts trusted CA bundle | No-op if ConfigMap absent |
| 17 | `withSABoundToken` | SA token volume projection | Always applied |
| 18 | `withCloudCredentials` | AWS/GCP credential mount (controller only) | Skipped if no Infrastructure API |

**IstioCSR install sequence** (`install_istiocsr.go`) — **pattern for trust-manager**:

| # | Step | Function | On Error |
|---|------|----------|----------|
| 1 | Validate config | `validateIstioCSRConfig` | IrrecoverableError → Degraded, no requeue |
| 2 | Network policies | `createOrApplyNetworkPolicies` | RetryRequired → requeue 30s |
| 3 | Services | `createOrApplyServices` | RetryRequired → requeue 30s |
| 4 | Service accounts | `createOrApplyServiceAccounts` | RetryRequired → requeue 30s |
| 5 | RBAC | `createOrApplyRBACResource` | RetryRequired → requeue 30s |
| 6 | Certificates | `createOrApplyCertificates` | RetryRequired → requeue 30s |
| 7 | Deployments | `createOrApplyDeployments` | RetryRequired → requeue 30s |
| 8 | Annotation | `addProcessedAnnotation` | RetryRequired → requeue 30s |

**Note:** IstioCSR uses **create-or-update** with deep equality checks (`hasObjectChanged()`). The `agents.md` prescribes **Server-Side Apply** for new addons — trust-manager SHOULD use SSA per guidance, but the `pkg/controller/common/` package does not exist on this branch. Implementation must create the common package or use create-or-update like IstioCSR.

### §4.3 Image Resolution

| Image | Env Var | Location |
|-------|---------|----------|
| cert-manager-controller | `RELATED_IMAGE_CERT_MANAGER_CONTROLLER` | `pkg/controller/deployment/related_images.go` |
| cert-manager-webhook | `RELATED_IMAGE_CERT_MANAGER_WEBHOOK` | `pkg/controller/deployment/related_images.go` |
| cert-manager-cainjector | `RELATED_IMAGE_CERT_MANAGER_CA_INJECTOR` | `pkg/controller/deployment/related_images.go` |
| cert-manager-acmesolver | `RELATED_IMAGE_CERT_MANAGER_ACMESOLVER` | `pkg/controller/deployment/related_images.go` (arg injection) |
| istio-csr | `RELATED_IMAGE_CERT_MANAGER_ISTIOCSR` | `pkg/controller/istiocsr/constants.go` |
| trust-manager (planned) | `RELATED_IMAGE_CERT_MANAGER_TRUSTMANAGER` | Does not exist yet |

ACME solver is injected as `--acme-http01-solver-image=` controller arg via `withOperandImageOverrideHook`, not a container image field.

### §4.4 Status & Conditions

**Two condition systems:**

1. **Core cert-manager** — OpenShift `OperatorStatus` with per-component conditions (`{Controller|Webhook|CAInjector}Available/Progressing/Degraded`).
2. **IstioCSR (addon pattern)** — Custom `Ready`/`Degraded` conditions on the IstioCSR CR via `SetCondition()` from `conditions.go`.

**Error classification** (`pkg/controller/istiocsr/errors.go`):
- `IrrecoverableError` → permanent Degraded=True, no requeue
- `RetryRequiredError` → requeue ~30s
- `MultipleInstanceError` → reject concurrent singleton instances
- `FromClientError()` → 401/403/Invalid treated as irrecoverable; otherwise retryable

### §4.5 Feature Gate Mechanism

**Definition** (`api/operator/v1alpha1/features.go`):
- `FeatureIstioCSR` — GA, default on. No cluster FeatureSet gating required.
- Trust-manager gate — **not present**; must be added as TechPreview.

**Runtime** (`pkg/features/features.go`):
- GA: `DefaultFeatureGate.Enabled(Feature<Name>)` — direct check
- **TechPreview: requires BOTH operator gate AND `FeatureGateState.passesClusterPreviewGating()`** — discovers `featuregates.config.openshift.io/cluster`, checks `spec.featureSet` against `TechPreviewNoUpgrade`/`CustomNoUpgrade`/`DevPreviewNoUpgrade`/`OKD`, retries 3x with 30s backoff, **fails closed**

**Wiring** (`starter.go`):
- GA: `features.Is<Name>FeatureGateEnabled()` → starts manager
- TechPreview: `featureStatus.Is<Name>FeatureGateEnabled()` → conditional start

## §5 Reusable Assets (Anti-Duplication)

| Asset | Use For | Evidence |
|-------|---------|----------|
| `api/operator/v1alpha1/conditions.go` — `SetCondition()`, `GetCondition()` | Status condition management for any addon CR | Used by IstioCSR for Ready/Degraded |
| `api/operator/v1alpha1/meta.go` — `ConditionalStatus`, `Mode`, `ConfigMapReference` | Shared types embedded in addon CR Status | Embedded in `IstioCSRStatus` |
| `pkg/controller/istiocsr/errors.go` — error types | Error classification for reconciliation | IrrecoverableError/RetryRequired pattern |
| `pkg/features/features.go` — `SetupWithFlagValue()`, `FeatureGateState` | Feature gate registration and cluster FeatureSet gating | All addon feature gates wire through this |
| `pkg/version/version.go` | Build version injection | Used in setup_manager log |
| `hack/update-istio-csr-manifests.sh` | **Template** for `hack/update-trust-manager-manifests.sh` | Helm template → yq relabel → split |
| `pkg/controller/istiocsr/controller.go` — `NewCacheBuilder` | Label-based cache filtering pattern | Reuse label selector cache approach |
| `go-bindata` (`hack/update-bindata.sh`) | Embed YAML manifests as Go assets | `make update-bindata` after adding `bindata/trust-manager/` |

**Do NOT duplicate:**
- Error types — reuse from istiocsr package or factor into common/
- Condition helpers — reuse `conditions.go`
- Feature gate wiring — extend existing `features.go` + `pkg/features/`

## §6 Architectural Guardrails

### Structural
- **Addon controllers MUST use controller-runtime** — never library-go patterns. Evidence: `agents.md` "All addon work uses controller-runtime. Never follow certmanager/ patterns for addons."
- **Single shared `ctrl.Manager`** — never create separate managers. Evidence: `setup_manager.go` registers all addon reconcilers on one manager.
- **Addon CRs MUST NOT embed `operatorv1.OperatorSpec`** — use domain-specific specs. Evidence: `IstioCSR` has custom `IstioCSRSpec`; only `CertManager` embeds `operatorv1`.

### API / Schema
- **Singleton enforcement via CEL** — `self.metadata.name == 'cluster'` (cluster-scoped) or `self.metadata.name == 'default'` (namespaced). Evidence: istiocsr_types.go validation rule.
- **Immutable fields use CEL** — `oldSelf == '' || self == oldSelf`. Evidence: IstioCSR issuerRef, privateKeyAlgorithm, namespace, port.
- **API group: `operator.openshift.io/v1alpha1`** — all addon CRs. Evidence: `groupversion_info.go`.
- **No admission/conversion webhooks** — CEL handles all validation. Evidence: `agents.md` common mistakes.

### Build / Tooling
- **Go 1.24.4** — match `go.mod`. Evidence: `go.mod` `go 1.24.4`.
- **Vendor mode** — `modules-download-mode: vendor`. Evidence: `.golangci.yaml`.
- **Import ordering** — local imports (`github.com/openshift/cert-manager-operator`) after third-party. Evidence: `.golangci.yaml` `goimports.local-prefixes`.
- **Linter set** — explicit allowlist only (errcheck, gofmt, goimports, gosec, gosimple, govet, ineffassign, misspell, staticcheck, typecheck, unused). Evidence: `.golangci.yaml`.

### Deployment / Packaging
- **UBI9-minimal base image** — `registry.access.redhat.com/ubi9-minimal:9.2`, non-root `USER 65532:65532`. Evidence: `Dockerfile`.
- **OLM bundle** — CSV generated via `make bundle`. Evidence: `bundle/manifests/`.
- **Operand versions pinned in Makefile** — not in Go code. Evidence: `CERT_MANAGER_VERSION`, `ISTIO_CSR_VERSION`.
- **RELATED_IMAGE prefix** — `RELATED_IMAGE_CERT_MANAGER_<UPPERCASE_NAME>`. Evidence: `agents.md`, `istiocsr/constants.go`.

### Code Generation
- **Never hand-edit generated files** — `zz_generated.deepcopy.go`, CRD YAML, clientgen output. Evidence: `hack/verify-*.sh` scripts catch drift.
- **`make update` after any API change** — chains generate + manifests + bindata. Evidence: `Makefile`.
- **Bindata from helm** — `hack/update-<name>-manifests.sh` scripts. Evidence: `hack/update-istio-csr-manifests.sh`.

### Security
- **RBAC via kubebuilder markers** — on reconciler struct. Evidence: `certmanager_controller.go` (RBAC placeholder).
- **Operand RBAC from bindata** — not dynamically generated. Evidence: `bindata/istio-csr/*clusterrole*.yaml`.
- **FIPS** — `GOEXPERIMENT=strictfipsruntime` via `hack/go-fips.sh`. CGO_ENABLED=1. Evidence: `hack/go-fips.sh`.
- **No cluster-admin** — scoped permissions per component. Evidence: `config/rbac/role.yaml`.

## §7 Change Cascade Checklist

| When you change... | You must also... | Verify with... |
|---|---|---|
| API type fields in `api/operator/v1alpha1/` | Regenerate deepcopy, update CRD bases, update clientgen | `make generate && make manifests && make verify` |
| Bindata manifests in `bindata/` | Regenerate go-bindata assets | `make update-bindata && make verify` |
| Upstream operand version (Makefile var) | Run update script, regenerate bindata, update bundle | `make update-manifests && make update-bindata && make bundle` |
| RBAC (kubebuilder markers on controller) | Regenerate role.yaml | `make manifests && make verify` |
| `features.go` (add feature gate) | Update `pkg/features/` wiring, `starter.go` check, CSV | `make generate && make manifests && go build ./...` |
| Controller watches (new GVK) | Add to `setup_manager.go` managed resources, scheme | `go build ./... && make test` |
| New addon controller package | Wire in `setup_manager.go`, add feature gate, add RBAC markers | `make generate && make manifests && make verify && make test` |
| OLM CSV (bundle/manifests) | Regenerate bundle | `make bundle && hack/verify-bundle.sh` |
| Go dependencies | Update vendor, verify deps | `go mod tidy && go mod vendor && make verify-deps` |
| Network policies | Update bindata, ensure NP controller reconciles | `make update-bindata && make test` |

## §8 Test & CI Reference

### §8.1 Test Structure

| Tier | Location | Framework | Build Tag |
|------|----------|-----------|-----------|
| Unit | `pkg/**/*_test.go` | `testing` + `testify` + counterfeiter fakes | none |
| API Integration | `test/apis/` | envtest (branch-dependent — verify presence) | none |
| E2E | `test/e2e/` | Ginkgo v2 + Gomega, live cluster | `e2e` |

### §8.2 How to Run Tests Locally

```bash
# Unit tests (includes envtest for API tests)
make test

# Lint
make lint

# Full verification (all hack/verify-*.sh)
make verify

# E2E (requires deployed operator on cluster)
make test-e2e

# E2E with custom label filter
E2E_GINKGO_LABEL_FILTER="Feature:IstioCSR" make test-e2e

# E2E wait for stable state first
make test-e2e-wait-for-stable-state

# Build only
make build
```

### §8.3 CI Pipeline

- **System:** Prow via `openshift/release` — this repo does NOT ship `.github/workflows`
- **PR jobs:** `make verify`, `make lint`, `make test`, image build
- **E2E:** Separate Prow job with live cluster; default filter `Platform: isSubsetOf {AWS}`
- **E2E timeout:** 1h (configurable via `E2E_TIMEOUT`)

### §8.4 Test Coverage Gaps

- No unit tests for `pkg/operator/starter.go` or `setup_manager.go` (bootstrap logic)
- No unit tests for core deployment reconciliation (`cert_manager_controller_set.go`)
- Network policy controllers lack dedicated unit tests
- `test/apis/` directory — branch-dependent, verify before relying on it
- No trust-manager tests of any kind (greenfield)

## §9 Developer Workflow

### §9.1 Key Commands Reference

| Command | Purpose | When to use |
|---------|---------|-------------|
| `make build` | Generate + fmt + vet + compile binary | After any code change |
| `make update` | Full codegen refresh (generate + manifests + bindata + deps) | After API type, bindata, or dependency changes |
| `make manifests` | Regenerate CRD YAML + RBAC from markers | After kubebuilder marker changes |
| `make generate` | Regenerate deepcopy, clientgen | After API type field changes |
| `make update-bindata` | Regenerate go-bindata from `bindata/` | After modifying manifest files |
| `make verify` | Run all `hack/verify-*.sh` scripts | Before every PR push |
| `make lint` | golangci-lint | Before every PR push |
| `make test` | Unit + envtest | Before every PR push |
| `make test-e2e` | E2E against live cluster | After functional changes |
| `make bundle` | Regenerate OLM bundle | After CSV/CRD/RBAC changes |
| `make local-run` | Run operator locally against cluster | Development/debugging |
| `make image-build` | Build container image | Release prep |
| `make deploy` | Deploy to cluster | Integration testing |

### §9.2 Version Variables

| Variable | Default | Location | When to Update |
|----------|---------|----------|----------------|
| `CERT_MANAGER_VERSION` | `"v1.18.4"` | `Makefile` | cert-manager operand bump |
| `ISTIO_CSR_VERSION` | `"v0.14.2"` | `Makefile` | istio-csr operand bump |
| `BUNDLE_VERSION` | `1.18.1` | `Makefile` | Operator release |
| `ENVTEST_K8S_VERSION` | `1.25.0` | `Makefile` | K8s API bump |
| Go version | `1.24.4` | `go.mod` | Toolchain update |

**Trust-manager will need:** `TRUST_MANAGER_VERSION` added to Makefile.

### §9.3 Local Development Setup

```bash
# Prerequisites: go 1.24.4, podman/docker, oc/kubectl, cluster access
# Clone and vendor
git clone https://github.com/openshift/cert-manager-operator
cd cert-manager-operator

# Build
make build

# Deploy operator (creates namespace, CRDs, RBAC, deployment)
make deploy

# Scale down deployed operator, run locally
oc scale --replicas=0 deploy --all -n cert-manager-operator
make local-run
```

Required environment for local-run: `hack/local-run-config.yaml` provides controller-runtime config.

### §9.4 Common Development Scenarios

**How to add a new addon operand (trust-manager pattern):**

1. **API types:** Create `api/operator/v1alpha1/trustmanager_types.go` — register via `init()`, define `TrustManager`/`TrustManagerList` with kubebuilder markers (scope, singleton CEL, categories, printcolumns). Add `TrustManagerSpec` (domain-specific config) + `TrustManagerStatus` (embed `ConditionalStatus` + observed fields).
2. **Feature gate:** Add `FeatureTrustManager` to `features.go` with `{Default: false, PreRelease: "TechPreview"}`.
3. **Bindata:** Create `hack/update-trust-manager-manifests.sh` (helm template → yq relabel → split to `bindata/trust-manager/resources/`). Add `TRUST_MANAGER_VERSION` to Makefile.
4. **Controller:** Create `pkg/controller/trustmanager/` with controller.go, install_trustmanager.go, constants.go, errors.go (or reuse), deployments.go, rbacs.go, services.go, serviceaccounts.go.
5. **Wiring:** In `setup_manager.go` add trust-manager reconciler registration. In `starter.go` add TechPreview feature gate check.
6. **RBAC:** Add `+kubebuilder:rbac` markers on reconciler for all managed GVKs.
7. **OLM:** Update CSV with owned CRD, env vars, relatedImages. Add sample CR.
8. **Tests:** Unit tests per reconciler file + e2e test with `Feature:TrustManager` label.
9. **Codegen:** `make generate && make manifests && make update-bindata && make bundle && make verify`

## §10 Platform & Environment Integration

### §10.1 Security Context & Permissions

- Operator runs as non-root (`USER 65532:65532` in Dockerfile)
- No SCC customization — uses restricted-v2 by default
- Operand pods follow upstream security context from bindata manifests

### §10.2 Proxy & Network Configuration

- **Proxy:** `withProxyEnv` hook uses `operator-framework/operator-lib/proxy` to propagate OLM-injected `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` to operand deployments
- **Trusted CA:** `withCAConfigMap` mounts CA at `/etc/pki/tls/certs/cert-manager-tls-ca-bundle.crt` from CNO-injected ConfigMap (`config.openshift.io/inject-trusted-cabundle: "true"`)
- **Runtime flag:** `--trusted-ca-configmap`
- **Network policies:** Default deny + explicit allow rules per component in `bindata/networkpolicies/`

### §10.3 Cloud Provider Integration

- **AWS:** `credentials_request.go` mounts cloud secret at `/.aws` with `AWS_SDK_LOAD_CONFIG=1`
- **GCP:** Mounts at `/.config/gcloud/application_default_credentials.json`
- **Azure:** NOT implemented (returns error in default case)
- Applied to controller deployment only, not webhook or cainjector
- CredentialsRequest YAMLs are in `test/e2e/testdata/credentials/` — admin applies externally

### §10.4 Build & Compliance Constraints

- **FIPS:** `hack/go-fips.sh` — `GOEXPERIMENT=strictfipsruntime`, tags `strictfipsruntime,openssl`, CGO_ENABLED=1. Uses OpenSSL via strictfipsruntime (not boringcrypto).
- **Multi-arch:** Standard CI multi-arch builds via Prow
- **Disconnected:** RELATED_IMAGE env vars enable image mirroring; no special mechanism needed
- **Operand fork:** `openshift/jetstack-cert-manager` (not upstream jetstack) — via `go.mod` replace directive

### §10.5 Console / UI Integration

- No ConsolePlugin verified on this branch
- No QuickStart verified on this branch
- YAML samples may exist in `config/samples/` — branch-dependent

### §10.6 Packaging & Lifecycle

- **OLM:** CSV at `bundle/manifests/cert-manager-operator.clusterserviceversion.yaml`
- **Channels:** `stable-v1`, `stable-v1.18` (configurable in Makefile)
- **Upgrade:** `replaces`/`skipRange` in CSV; operand versions pinned in Makefile
- **InstallModes:** AllNamespaces (operator watches all namespaces)
- **Related images:** Declared in CSV from Makefile env vars

## §11 Risks & Downstream Impacts

- **`pkg/controller/common/` does not exist** — `agents.md` prescribes shared client/SSA/error packages that are not on this branch. Trust-manager implementation must either create this package or duplicate patterns from istiocsr. Risk: inconsistency if IstioCSR is later migrated to common/.
- **SSA vs create-or-update divergence** — agents.md mandates SSA for new addons but IstioCSR uses create-or-update. Trust-manager may need to pioneer SSA adoption without a working reference on this branch.
- **Upstream Bundle → ClusterBundle migration** — trust-manager upstream is deprecating `Bundle` (cluster-scoped, v1alpha1) in favor of `ClusterBundle` (v1alpha2). First release should support Bundle only, but plan for API migration.
- **Feature gate fails closed** — TechPreview feature gates that cannot discover `featuregates.config.openshift.io/cluster` will reject the CR silently. Must handle this gracefully in status.
- **Namespace hardcoding** — trust-manager operand namespace must be decided (same `cert-manager` namespace as core operand, or separate?). IstioCSR deploys in same namespace as its CR.

### §11.1 Assessment Limitations / UNVERIFIED Items

- **`pkg/controller/common/`** — NOT on this branch. agents.md describes it as existing; verified it does NOT exist via directory listing.
- **`pkg/controller/trustmanager/`** — NOT on this branch. Greenfield implementation required.
- **`bindata/trust-manager/`** — NOT on this branch.
- **`FeatureTrustManager` gate** — NOT in `features.go`.
- **`test/apis/`** — NOT verified on this branch (may or may not exist).
- **ConsoleYAMLSample/QuickStart** — not found in `config/` or `bundle/` scan.
- **`hack/update-trust-manager-manifests.sh`** — does NOT exist.
- **TrustManager CRD (`operator.openshift.io_trustmanagers.yaml`)** — does NOT exist in `config/crd/bases/`.
- **IstioCSR e2e full behavior** — 880-line test file read at surface level; specific gRPC testing patterns not fully analyzed.

## §12 Quick Reference Card

### Preflight Checklist (run before every PR)

```
1. make generate && make manifests
2. make update-bindata       (if bindata changed)
3. make verify
4. make lint
5. make test
6. make bundle               (if CSV/CRD/RBAC changed)
7. hack/verify-bundle.sh     (if bundle changed)
```

### Key File Quick-Nav

| I want to... | Look at... |
|---|---|
| Add a new addon CRD | `api/operator/v1alpha1/istiocsr_types.go` (pattern), `groupversion_info.go` |
| Add a feature gate | `api/operator/v1alpha1/features.go` + `pkg/features/features.go` |
| Add a new addon controller | `pkg/controller/istiocsr/controller.go` (pattern) + `pkg/operator/setup_manager.go` |
| Add operand manifests (bindata) | `bindata/istio-csr/` (pattern) + `hack/update-istio-csr-manifests.sh` |
| Wire feature gate to controller start | `pkg/operator/starter.go` (line ~145 FeatureIstioCSR check) |
| Add RBAC for new GVK | kubebuilder markers on controller + `make manifests` |
| Add e2e test for addon | `test/e2e/istio_csr_test.go` (pattern) |
| Change operand version | `Makefile` version variable + `make update-manifests` |
| Add RELATED_IMAGE | `pkg/controller/<addon>/constants.go` + CSV + Makefile |
| Understand core deployment hooks | `pkg/controller/deployment/generic_deployment_controller.go` |
| Debug dead code / RBAC placeholder | `pkg/controller/deployment/certmanager_controller.go` — DO NOT EDIT |
