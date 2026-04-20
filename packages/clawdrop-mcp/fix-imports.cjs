const fs = require('fs');
const path = require('path');

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Fix imports: add .js to relative imports that don't have an extension
      content = content.replace(/from\s+(['"])(\.\.?[\.\/][^'"]+)\1/g, (match, quote, importPath) => {
        if (/\.[a-zA-Z0-9]+$/.test(importPath)) {
          return match;
        }
        return `from ${quote}${importPath}.js${quote}`;
      });
      
      content = content.replace(/import\s*\(\s*(['"])(\.\.?[\.\/][^'"]+)\1\s*\)/g, (match, quote, importPath) => {
        if (/\.[a-zA-Z0-9]+$/.test(importPath)) {
          return match;
        }
        return `import(${quote}${importPath}.js${quote})`;
      });
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

const distDir = process.argv[2] || './dist';
fixImports(distDir);
console.log('Fixed imports in', distDir);
