# Contributing to Clawdrop

We welcome contributions! This document outlines our process.

## Getting Started

1. **Pick a task** — Look for issues labeled `good-first-issue` or `help-wanted`
2. **Create a branch** — Use descriptive names: `feat/agent-wallet-auth`, `fix/mcp-connection-timeout`
3. **Commit messages** — Use [conventional commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation
   - `chore:` Build, deps, config
   - `test:` Tests
   - `refactor:` Code reorganization

   Example: `feat: add wallet signature authentication to clawdrop-platform`

## PR Process

1. **Before submitting** — Ensure:
   - Code builds: `npm run build`
   - Tests pass: `npm run test`
   - Types check: `npm run typecheck`
   - No linting errors: `npm run lint`

2. **Create a PR** with:
   - Clear title following the commit convention
   - Description of what changed and why
   - Link to any related issues
   - Screenshots (UI changes)

3. **Review** — Maintainers will:
   - Run automated checks
   - Review code
   - Suggest improvements
   - Approve or request changes

## Code Ownership

See [.github/CODEOWNERS](.github/CODEOWNERS) for package ownership.

## Development Setup

See [docs/getting-started/development-setup.md](docs/getting-started/development-setup.md)

## Questions?

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- Check [docs/API.md](docs/API.md) for API reference
- Open a discussion in the repository

## Code of Conduct

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and inclusive.

Thank you for contributing to Clawdrop!
