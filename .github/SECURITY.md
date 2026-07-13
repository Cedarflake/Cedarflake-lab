# Security Policy

## Supported Versions

Security fixes are maintained on the `main` branch of this monorepo. Archived experiments and historical artifacts may not receive security updates unless they are still used by a supported application or package.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability or include exploit details in a public discussion.

Use GitHub private vulnerability reporting from the repository's **Security** tab when it is available. If private reporting is unavailable, contact the repository owner through an established private channel and include:

- The affected application, package, commit, or release
- Reproduction steps or a minimal proof of concept
- The expected impact and affected data or users
- Relevant logs or screenshots with secrets removed
- Any known mitigations

The maintainer will make a best effort to acknowledge the report privately, assess its scope, and coordinate disclosure after a fix or mitigation is available.

## Repository Security Checks

Dependabot checks repository-level GitHub Actions references for updates. The automated checks are split by ownership and cost:

- **[Repo] CodeQL Security (JS/TS)** scans JavaScript and TypeScript across the repository.
- **[Group] Apps & Packages CI** audits production dependencies, checks apps and packages, and builds them.
- **[Group] Workbench Python CI** checks formatting and lint, runs the registered Python tests, and audits the dependency sets registered in its audit matrix.
- **[Project] Liminal Drift CI** adds bundle-budget validation and browser smoke checks for Liminal Drift.
- **[Project] YouTube Auto Resume CI** runs the userscript checks and Chromium end-to-end coverage without expanding the apps/packages workflow.
