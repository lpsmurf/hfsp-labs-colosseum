# Quick Commands for Orchestration

## Check Status (all LLMs)
```bash
./tools/orchestration-dashboard/status.sh
```

## View Current Tasks
```bash
cat ~/.clawdrop-status/[YOUR_NAME].md
```

## Update Your Status
```bash
nano ~/.clawdrop-status/[YOUR_NAME].md
```

## Create Working Branch
```bash
git checkout -b feature/[YOUR_NAME]/[scope]
```

## Build & Test
```bash
npm run build && npm test
```

## View Dependency Graph (with NX)
```bash
npx nx graph
```

## Run Affected Tests
```bash
npx nx affected:test --parallel
```

## Check Blockers
```bash
grep -r "Blocked By" ~/.clawdrop-status/
```

## See Who Owns What
```bash
grep -r "owns\|Owns" MULTI_LLM_WORKFLOW.md
```
