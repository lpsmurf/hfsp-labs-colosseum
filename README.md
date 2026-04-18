# HFSP Labs - Colosseum Hackathon Submission

A unified monorepo containing the complete HFSP Labs payment protocol ecosystem.

## Overview

HFSP Labs is advancing Web3 infrastructure with innovative payment solutions:

- **Clawdrop MCP**: Advanced payment protocol with dynamic pricing, multi-asset support, and transaction management
- **Agent Provisioning**: Intelligent provisioning system with automated service deployment and management

## Repository Structure

```
hfsp-labs-colosseum/
├── packages/
│   ├── agent-provisioning/     # Service provisioning and deployment
│   │   ├── services/           # Clawdrop Wizard, Storefront Bot, Webapp
│   │   └── [application code]
│   │
│   └── clawdrop-mcp/           # Core payment protocol implementation
│       ├── src/                # TypeScript source
│       ├── scripts/            # Demo and test scripts
│       └── bin/                # CLI tools
│
├── LICENSE                     # Commons Clause + MIT License
├── TECHNICAL_INNOVATIONS.md    # Document of unique architectural approaches
└── README.md                   # This file
```

## Getting Started

### Prerequisites
- Node.js 18+
- TypeScript
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum

# Install dependencies for both packages
cd packages/agent-provisioning && npm install && cd ../..
cd packages/clawdrop-mcp && npm install && cd ../..
```

### Development

Each package has its own development configuration:

```bash
# Agent Provisioning
cd packages/agent-provisioning
npm run dev

# Clawdrop MCP  
cd packages/clawdrop-mcp
npm run dev
```

## Technical Highlights

See [TECHNICAL_INNOVATIONS.md](TECHNICAL_INNOVATIONS.md) for detailed documentation of:

- **x402 Payment Protocol**: Dynamic fee adjustment based on transaction type and network state
- **Multi-Asset Transaction Routing**: Semantic routing with real-time price feeds
- **Advanced Provisioning System**: Intelligent deployment across multiple infrastructure providers
- **Real-time Fee Collection**: Automated billing with multiple fee models

## IP & Licensing

This project uses a **Commons Clause + MIT License**:

✅ **Permitted:**
- Evaluation and testing (including for hackathon judging)
- Forking and local deployment for assessment
- Contributing improvements via pull requests

❌ **Not Permitted Without License:**
- Commercial use or monetization
- Repackaging as your own product
- Removal or modification of attribution

See [LICENSE](LICENSE) for full terms.

## Architecture & Innovation Timeline

Development timeline and architectural decisions are tracked in:
- **Git commit history** with timestamps proving development progression
- **TECHNICAL_INNOVATIONS.md** documenting unique problem-solving approaches
- **Source code comments** highlighting proprietary algorithms and techniques

This creates an auditable record of original development.

## For Colosseum Hackathon Judges

This monorepo submission includes:
- ✓ Complete source code in single repository
- ✓ Full git history with development timeline
- ✓ Comprehensive technical documentation
- ✓ Clear IP licensing and attribution
- ✓ Original architectural innovations
- ✓ Production-ready code quality

## Contact

**HFSP Labs**
- Website: (Coming Soon)
- Email: info@asicgenesis.com

---

**Last Updated:** April 18, 2026
**Submission Date:** Colosseum Hackathon 2026
