const fs = require('fs');
const path = require('path');

const externals = [
  '@solana/web3.js',
  'rpc-websockets',
  'bigint-crypto-utils',
  '@triton-one/yellowstone-grpc',
  'bufferutil',
  'utf-8-validate',
  'x402engine-mcp',
];

const SKIP = new Set();
const DEV_PATTERNS = [/^@types\//, /^typescript$/];

const needed = new Set();
const seen = new Set();

function shouldSkip(name) {
  return DEV_PATTERNS.some(p => p.test(name));
}

function resolvePackage(name, fromDir) {
  let dir = fromDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return path.dirname(pkgPath);
    }
    dir = path.dirname(dir);
  }
  return null;
}

function collectDeps(name, fromDir) {
  if (seen.has(name)) return;
  if (shouldSkip(name)) return;
  seen.add(name);
  needed.add(name);

  const pkgDir = resolvePackage(name, fromDir);
  if (!pkgDir) {
    SKIP.add(name);
    return;
  }

  const pkgPath = path.join(pkgDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };

  for (const dep of Object.keys(deps)) {
    if (shouldSkip(dep)) continue;
    collectDeps(dep, pkgDir);
  }
}

for (const ext of externals) {
  collectDeps(ext, path.resolve('.'));
}

console.log('Packages needed:', needed.size);
if (SKIP.size > 0) {
  console.log('Skipped/missing:', [...SKIP].sort().join(', '));
}

fs.mkdirSync('runtime_node_modules', { recursive: true });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true, dereference: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const entry of fs.readdirSync('node_modules')) {
  const srcPath = path.join('node_modules', entry);
  if (!fs.statSync(srcPath).isDirectory()) continue;

  if (entry.startsWith('@')) {
    for (const scopedEntry of fs.readdirSync(srcPath)) {
      const scopedName = `${entry}/${scopedEntry}`;
      if (needed.has(scopedName)) {
        copyDir(
          path.join(srcPath, scopedEntry),
          path.join('runtime_node_modules', entry, scopedEntry)
        );
      }
    }
  } else if (needed.has(entry)) {
    copyDir(srcPath, path.join('runtime_node_modules', entry));
  }
}

console.log('Done');
