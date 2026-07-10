# Security Policy

## Supported Versions

The `main` branch is the only supported line for security fixes.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities.

Use GitHub private vulnerability reporting if it is available for this repository. If private reporting is unavailable, contact the repository owner through a private channel and include:

- Affected commit or release
- Reproduction steps
- Expected impact
- Relevant logs, screenshots, or proof of concept

The project maintainer should acknowledge reports privately before publishing details or fixes.

## Dependency Security

Dependency updates, production audits, license policy checks, CodeQL, and browser smoke checks run through CI. Security fixes should keep `pnpm check` and the browser smoke checks passing before release.
