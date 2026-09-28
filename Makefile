## OpenSpec Dashboard — data generation
##
## Regenerates the processed JSON files under data/processed/ that the
## dashboard's JS fetches at runtime, from the raw per-operator metric
## files under data/open-spec-matrics/operators/<operator>/.
##
## Mirrors what .github/workflows/generate-processed-metrics.yml runs in CI.

PYTHON        ?= python3
RAW_ROOT       := data/open-spec-matrics/operators
PROCESSED_DIR       := data/processed
CVE_PROCESSED_DIR  := $(PROCESSED_DIR)/cve

# Auto-discover operator tabs from the raw data directory (one per subfolder).
OPERATORS := $(notdir $(wildcard $(RAW_ROOT)/*))

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_.-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.PHONY: update-data
update-data: $(addprefix update-data-,$(OPERATORS)) update-sdlc-summary ## Regenerate processed data for every operator tab

.PHONY: update-data-%
update-data-%: ## Regenerate processed data for one operator (e.g. make update-data-ztwim)
	@echo "==> Processing operator: $*"
	$(PYTHON) scripts/generate_processed_metrics.py \
		--raw-dir "$(RAW_ROOT)/$*/" \
		--output "$(PROCESSED_DIR)/$*_epics.json" \
		--qe-output "$(PROCESSED_DIR)/$*_qe.json"

.PHONY: update-sdlc-summary
update-sdlc-summary: ## Regenerate the cross-operator monthly SDLC summary
	@echo "==> Processing SDLC summary"
	$(PYTHON) scripts/generate_sdlc_summary.py

.PHONY: list-operators
list-operators: ## List detected operator tabs
	@echo $(OPERATORS)

.PHONY: fetch-jira-cve
fetch-jira-cve: ## Fetch ai-cve-analyzed Vulnerability issues from Jira. Usage: make fetch-jira-cve JIRA_TOKEN_FILE=/path/to/token
ifndef JIRA_TOKEN_FILE
	$(error JIRA_TOKEN_FILE is required, e.g. make fetch-jira-cve JIRA_TOKEN_FILE=/path/to/jira_token.txt)
endif
	@echo "==> Fetching AI-CVE-analyzed Jira issues"
	$(PYTHON) scripts/fetch_jira_cve_issues.py \
		--token-file "$(JIRA_TOKEN_FILE)" \
		--output data/jira/fetch_cve_issues.json

.PHONY: update-processed-cve
update-processed-cve: ## Regenerate per-operator + CVE tab summary processed JSON
	$(PYTHON) scripts/generate_cve_data.py \
		--input data/jira/fetch_cve_issues.json \
		--output-dir $(CVE_PROCESSED_DIR)

.PHONY: update-cve
update-cve: fetch-jira-cve update-processed-cve ## Fetch Jira CVE issues and regenerate per-operator processed JSON
