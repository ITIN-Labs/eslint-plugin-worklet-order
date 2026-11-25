# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: on this repository's Security tab, choose "Report a vulnerability". Don't open a public issue. You'll get a reply within a week, and we'll keep you posted until it's fixed.

## Supported versions

Only the latest 0.x minor release gets security fixes.

## Scope

In scope: source code that makes the rule crash, hang or use unbounded memory while linting, and the usual problems in the package itself (vulnerable dependencies, code execution, unexpected file or network access).

Out of scope: the rule missing a case or reporting a false positive, which is a normal bug, and problems in ESLint, its parsers or the worklets Babel plugin, which should go to those projects.

The threat model is in [docs/security.md](docs/security.md).
