# Colosseum Development Guide

## Phase 2: Skills Architecture (Context Engineering Optimization)

The Colosseum project includes 4 specialized skills designed to reduce token consumption and improve coordination when multiple LLM agents work together.

### Available Skills

All skills are located in `.claude/skills/` directory:

#### 1. **colosseum-sdk** — Service Patterns & API Contracts
SDK patterns, client libraries, type definitions, payment protocol, MemPalace integration

#### 2. **colosseum-cli** — CLI Commands & Deployment
CLI commands reference, service management, Docker operations, deployment procedures

#### 3. **colosseum-debug** — Error Diagnostics & Troubleshooting
Error codes, failure patterns, troubleshooting procedures, log interpretation

#### 4. **colosseum-agents** — Multi-Agent Coordination
File ownership matrix, task specificity, dependency graphs, conflict resolution

See `.claude/skills/manifest.json` for complete details.

