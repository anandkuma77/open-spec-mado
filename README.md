# OpenSpec Dashboard

Interactive dashboard tracking AI-powered operator development — onboarding status, agentic pipeline metrics, and per-ticket telemetry across cert-manager, ZTWIM, SSCSI, Must-Gather, ESO, and SMC operators.

**Live Dashboard:** [https://anandkuma77.github.io/open-spec-mado/](https://anandkuma77.github.io/open-spec-mado/)

## Local Development

```bash
python3 -m http.server 8080
```

Open **http://localhost:8080** in your browser.

To regenerate dashboard data from raw metrics, run `make help` and use the `update-data` targets.

## Project Structure

```
open-spec-mado/
├── index.html            # Site entry point (kept at root for GitHub Pages)
├── src/
│   ├── js/
│   │   ├── core/         # App bootstrap/router (app.js)
│   │   └── renderers/    # Tab renderers (epics, QE, CVE, SDLC, pipeline flow)
│   ├── css/              # Stylesheets
│   ├── partials/         # HTML fragments injected at runtime
│   └── tabs/             # Per-operator tab markup
├── data/                 # Runtime JSON (jira/, processed/, open-spec-matrics/)
├── scripts/              # Python data-generation scripts (see Makefile)
├── assets/               # Static binary assets (diagrams, spreadsheets)
└── docs/prompt-examples/ # Example prompts/specs/evals for reference
```

This is a build-tool-free static site — all wiring happens via `<link>`/`<script>` tags in `index.html` and runtime `fetch()`/dynamic `<script>` loading in `src/js/core/app.js`, resolved relative to `index.html`.
