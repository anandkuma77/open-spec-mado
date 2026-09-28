# Feature Specification: Trust-Manager Integration as Operand in Cert-Manager Operator

**Feature Branch**: `cm-830-trust-manager-integration`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "CM-830 — Integrate trust-manager into cert-manager-operator as a managed operand for distributing CA trust bundles across namespaces"

## User Scenarios & Testing

### User Story 1 - Enable Trust-Manager Operand (Priority: P1)

As a cluster administrator, I want to enable the trust-manager operand through the cert-manager operator so that I can manage CA trust bundle distribution across my cluster without manually deploying and maintaining trust-manager separately.

**Why this priority**: This is the foundational capability — without enabling the operand, no other trust-manager features are available. This unlocks the entire trust bundle distribution workflow.

**Independent Test**: Can be fully tested by creating the operator configuration resource with the feature enabled, and verifying that the trust-manager operand becomes healthy and operational.

**Acceptance Scenarios**:

1. **Given** the cert-manager operator is installed and the trust-manager feature gate is enabled AND the platform feature set permits Tech Preview features, **When** the administrator creates a trust-manager configuration resource, **Then** the operator deploys the trust-manager operand and reports a Ready status within 120 seconds.
2. **Given** the trust-manager feature gate is enabled but the platform feature set does NOT permit Tech Preview features, **When** the administrator creates a trust-manager configuration resource, **Then** the operator rejects the configuration with a clear status condition indicating the platform feature set prerequisite is not met.
3. **Given** the trust-manager operand is running and healthy, **When** the administrator deletes the trust-manager configuration resource, **Then** the operator removes all trust-manager managed resources and reports the operand as removed.

---

### User Story 2 - Distribute CA Trust Bundles to Namespaces (Priority: P1)

As a cluster administrator in a restricted network, I want to define CA trust bundle sources and have them automatically distributed to selected namespaces so that applications in those namespaces can trust my organization's internal CAs without manual ConfigMap creation.

**Why this priority**: This is the core value proposition — solving the pain of manually distributing CA bundles in restricted network environments. It directly addresses the customer ask.

**Independent Test**: Can be fully tested by creating a trust bundle resource referencing a CA source, labeling a target namespace, and verifying the trust bundle appears in that namespace.

**Acceptance Scenarios**:

1. **Given** the trust-manager operand is running, **When** an administrator creates a trust bundle resource specifying a ConfigMap source and a namespace label selector as target, **Then** the system creates a ConfigMap containing the aggregated trust bundle in every namespace matching the label selector.
2. **Given** a trust bundle resource targets namespaces with a specific label, **When** a new namespace is created with that label, **Then** the system automatically creates the trust bundle ConfigMap in the new namespace within 60 seconds.
3. **Given** a trust bundle resource is distributing bundles to selected namespaces, **When** the source CA material is updated, **Then** the system propagates the updated bundle to all target namespaces.
4. **Given** a trust bundle resource references a source that does not exist in the trusted namespace, **When** the system attempts to reconcile, **Then** it reports a clear error status on the trust bundle resource indicating the missing source.

---

### User Story 3 - Configure Secret-Based Trust Bundle Targets (Priority: P2)

As a cluster administrator, I want to optionally configure trust-manager to write trust bundles to Kubernetes Secrets (in addition to ConfigMaps) so that applications requiring certificate material in Secret format can consume the trust bundle natively.

**Why this priority**: Extends the distribution model for workloads that consume TLS material from Secrets rather than ConfigMaps. Important for broader adoption but not required for the initial trust bundle distribution use case.

**Independent Test**: Can be fully tested by enabling secret targets in the operator configuration, creating a trust bundle resource targeting a Secret, and verifying the Secret is created with the correct content.

**Acceptance Scenarios**:

1. **Given** the trust-manager configuration resource has secret targets enabled with a list of authorized secret names, **When** a trust bundle resource specifies one of those authorized secrets as a target, **Then** the system creates or updates the Secret with the aggregated trust bundle in target namespaces.
2. **Given** secret targets are enabled, **When** a trust bundle resource references a secret name NOT in the authorized list, **Then** the system rejects the configuration with a status condition indicating the secret is not authorized.
3. **Given** secret targets are NOT enabled in the operator configuration, **When** a trust bundle resource specifies a Secret target, **Then** the system rejects it with a clear error status.

---

### User Story 4 - Configure Operational Parameters (Priority: P3)

As a cluster administrator, I want to configure trust-manager operational settings (log verbosity, trusted namespace, expired certificate filtering) so that I can tailor the operand behavior to my environment's needs.

**Why this priority**: Operational tuning enhances supportability and debugging but is not required for core functionality.

**Independent Test**: Can be fully tested by modifying operational fields in the configuration resource and verifying the operand picks up the new settings.

**Acceptance Scenarios**:

1. **Given** the trust-manager operand is running, **When** the administrator updates the log verbosity in the configuration resource, **Then** the operand restarts with the new log level without disrupting existing trust bundle distribution.
2. **Given** expired certificate filtering is enabled, **When** a trust bundle source contains expired certificates, **Then** those expired certificates are excluded from the aggregated bundle distributed to target namespaces.
3. **Given** the administrator specifies a custom trusted namespace, **When** trust bundle resources reference sources in that namespace, **Then** the system reads sources from the specified namespace.

---

### Edge Cases

- **When** the trust-manager feature gate is disabled after the operand has been deployed and trust bundles are active, **then** the operator removes the trust-manager operand and its managed resources; existing trust bundle ConfigMaps/Secrets in target namespaces are preserved (not garbage-collected) to avoid breaking running applications.
- **When** multiple trust bundle resources target the same ConfigMap key in the same namespace, **then** the system reports a conflict status on the conflicting resources and does not overwrite existing bundle content from another resource.
- **When** the source ConfigMap or Secret in the trusted namespace is deleted while trust bundles reference it, **then** the trust bundle resource reports a degraded status condition and does not remove existing distributed bundles from target namespaces.
- **When** the operator is upgraded from a version without trust-manager support to one with support, **then** no trust-manager operand is deployed until the administrator explicitly creates the configuration resource (opt-in, not automatic).
- **When** the administrator removes a label from a namespace that was previously selected as a target, **then** the system removes the distributed trust bundle from that namespace.
- **When** the platform is in a disconnected/restricted network with no external registry access, **then** the operator deploys the trust-manager operand using images available through the standard operator image mirroring mechanism.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow cluster administrators to enable the trust-manager operand through the operator's configuration API, gated behind a feature gate that requires a compatible platform feature set (Tech Preview).
- **FR-002**: System MUST deploy and manage the trust-manager operand lifecycle (create, update, delete) when the configuration resource exists and prerequisites are met.
- **FR-003**: System MUST reject trust-manager configuration with a clear, actionable status condition when the platform feature set does not permit Tech Preview features.
- **FR-004**: System MUST support defining trust bundle sources from ConfigMaps and inline certificate material in a designated trusted namespace.
- **FR-005**: System MUST distribute aggregated trust bundles as ConfigMaps to all namespaces matching a label selector defined in the trust bundle resource.
- **FR-006**: System MUST automatically create trust bundles in newly created namespaces when they match an existing label selector.
- **FR-007**: System MUST propagate source material updates to all distributed trust bundles in target namespaces.
- **FR-008**: System MUST support optional Secret-based trust bundle targets, gated behind an explicit configuration field with fine-grained authorization (per-secret-name allowlist or global opt-in).
- **FR-009**: System MUST dynamically grant the operand only the RBAC permissions required by the current configuration (e.g., Secret access only when secret targets are enabled and scoped to authorized names).
- **FR-010**: System MUST report operand health via status conditions on the configuration resource (Ready, Degraded, Progressing).
- **FR-011**: System MUST report per-trust-bundle status conditions indicating sync success, source errors, or target conflicts.
- **FR-012**: System MUST allow administrators to configure operational parameters: log format, log verbosity, trusted namespace, and expired certificate filtering.
- **FR-013**: System MUST remove all operator-managed trust-manager resources when the configuration resource is deleted, without removing user-created trust bundles already distributed to namespaces.
- **FR-014**: System MUST NOT deploy any trust-manager resources when the feature gate is disabled, regardless of whether a configuration resource exists.

### Key Entities

- **Trust-Manager Configuration**: Cluster-scoped resource representing the desired state of the trust-manager operand. Controls feature enablement, secret targets, operational parameters. One instance per cluster.
- **Trust Bundle**: Cluster-scoped resource defining sources (ConfigMaps, Secrets, inline certificates) and targets (ConfigMaps or Secrets in label-selected namespaces). Multiple instances per cluster.
- **Trusted Namespace**: The namespace where source ConfigMaps/Secrets must reside. Configurable, defaults to the operator's namespace.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Administrator can enable the trust-manager operand and observe a Ready status within 120 seconds on a standard cluster with prerequisites met.
- **SC-002**: A trust bundle distributes a CA bundle ConfigMap to a newly labeled namespace within 60 seconds of the namespace receiving the target label.
- **SC-003**: Source material update in the trusted namespace propagates to all target namespaces within 60 seconds.
- **SC-004**: Invalid configuration (missing prerequisites, unauthorized secrets, non-existent sources) is surfaced as a clear status condition within 30 seconds — no silent failures.
- **SC-005**: Disabling the feature (deleting configuration resource) removes operator-managed resources without affecting user workloads consuming previously distributed trust bundles.
- **SC-006**: Enabling secret targets with a list of N authorized secret names grants access to exactly those N secrets — no broader permissions.

## Assumptions

- **A-001**: The primary user persona is a cluster administrator who manages the operator configuration. Application developers consume distributed trust bundles but do not interact with operator APIs. [Addresses validation gap: User Personas]
- **A-002**: Auto-mounting of CA trust bundles into containers via mutating webhook is explicitly OUT OF SCOPE for this change and will be tracked as a separate enhancement. [Addresses validation gap: Scope Boundaries]
- **A-003**: This feature ships as Tech Preview only. General Availability criteria and timeline are out of scope. [Addresses validation gap: Scope Boundaries]
- **A-004**: The platform provides an existing feature gate mechanism in the operator that can be extended for this feature. The specific feature gate name is an implementation detail. [Addresses validation gap: FeatureGate naming]
- **A-005**: For Tech Preview, the initial install path is the primary concern. Upgrade from a cluster without trust-manager to one with it requires explicit opt-in (create configuration resource). [Addresses validation gap: Upgrade / Migration Path]
- **A-006**: The operator follows existing RBAC and pod security patterns established for other operands (e.g., istio-csr integration). [Addresses validation gap: Security / RBAC Model]
- **A-007**: The upstream Bundle API (v1alpha1, cluster-scoped) is the supported API for this release. Future upstream API changes (ClusterBundle, namespace-scoped Bundle) will be addressed in subsequent releases.
- **A-008**: The defaultCAs feature (public trust bundle from OS packages) is NOT enabled by default for OpenShift deployments. [NEEDS CLARIFICATION: Should defaultCAs be entirely disabled/hidden, or available as an opt-in configuration field?]
- **A-009**: The trusted namespace defaults to the cert-manager operator's namespace unless explicitly overridden in the configuration resource.
- **A-010**: Image availability in disconnected environments is handled through existing operator image mirroring — no special mechanism needed for trust-manager images.
