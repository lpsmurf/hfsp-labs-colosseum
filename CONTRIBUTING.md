# Contributing to Clawdrop

Thank you for your interest in contributing! This document outlines our guidelines and process.

## Code of Conduct

We are committed to providing a welcoming and inclusive community. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

---

## How to Contribute

### 1. Pick a Task

**New to the project?**
- Look for [good-first-issue](https://github.com/lpsmurf/hfsp-labs-colosseum/issues?q=label%3A%22good+first+issue%22) labels
- Check [Help Wanted](https://github.com/lpsmurf/hfsp-labs-colosseum/issues?q=label%3A%22help+wanted%22)

**Want something specific?**
- Create a [new issue](https://github.com/lpsmurf/hfsp-labs-colosseum/issues) describing the problem/feature
- Wait for feedback from maintainers

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

**Branch naming convention:**
- `feature/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation
- `refactor/` — Code refactoring
- `test/` — Tests only
- `chore/` — Maintenance

### 3. Make Your Changes

**Code guidelines:**
- TypeScript strict mode required
- No `any` types (unless justified in comments)
- Follow existing code style
- Add tests for new features
- Update documentation

**Commit message format:**
```
[AGENT] type: brief description

Optional longer explanation.

Fixes #123
Relates to #456
```

**Agent prefixes (pick the closest match):**
- `[CLAUDE]` — Architecture, orchestration, integration
- `[CODEX]` — Code quality, audits, tests
- `[GEMINI]` — Backend, APIs, data services
- `[KIMI]` — DevOps, infrastructure, Docker
- `[CONTRIBUTOR]` — External contributor

**Commit types:**
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code refactoring
- `test:` adding/updating tests
- `chore:` maintenance, dependencies

### 4. Run Tests & Linting

```bash
npm test
npm run lint
npm run type-check
```

All checks must pass before submitting PR.

### 5. Submit a Pull Request

1. Push your branch: `git push origin feature/your-feature-name`
2. Open a [Pull Request](https://github.com/lpsmurf/hfsp-labs-colosseum/pulls)
3. Fill out the PR template
4. Link to related issues: `Fixes #123`
5. Wait for code review

**PR checklist:**
- [ ] Tests pass locally
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No breaking changes (or documented)

---

## Code Ownership

Certain files require code owner approval before merging. See [.github/CODEOWNERS](.github/CODEOWNERS).

**Key owners:**
- Agent Brain: Claude team
- Telegram Bot: Codex team  
- Web UI: Codex team
- Infrastructure: Kimi team
- Tests: Codex team

---

## Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Local Setup

```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum
npm install

# Start services
npm run dev

# Run tests
npm test

# Run linter
npm run lint
```

For detailed setup, see [docs/getting-started/development-setup.md](docs/getting-started/development-setup.md)

---

## Questions?

- **Setup help?** → [Troubleshooting Guide](docs/getting-started/troubleshooting.md)
- **Architecture questions?** → [Architecture Docs](docs/ARCHITECTURE.md)
- **API questions?** → [API Reference](docs/API.md)
- **General questions?** → [Discussions](https://github.com/lpsmurf/hfsp-labs-colosseum/discussions)

---

## Review Process

1. Automated checks (tests, linting, type checking)
2. Code review by at least one maintainer
3. Code owner approval (if applicable)
4. Merge & automatic deployment to staging
5. Deploy to production (manual or automated based on branch)

---

## Recognition

Contributors will be recognized in:
- Project README
- Release notes
- Contributors page

Thank you for contributing! 🎉

