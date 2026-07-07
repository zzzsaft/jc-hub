const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../src/components/quoteForm');
const result = {};

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith('.tsx')) {
      parseFile(fullPath);
    }
  }
}

function getFormType(filePath) {
  const rel = path.relative(dir, filePath);
  const parts = rel.split(path.sep);
  if (parts[0] === 'formComponents') return null;
  if (parts[0] === 'dieForm') return 'DieForm';
  if (parts.length === 1) return path.basename(parts[0], '.tsx');
  return parts[0];
}

function parseFile(filePath) {
  const formType = getFormType(filePath);
  if (!formType) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const formItemRegex = /<(?:ProForm\.|Form\.)Item[^>]*name=\"([^\"]+)\"[^>]*label=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/(?:ProForm\.|Form\.)Item>/g;
  const listSelfClosing = /<ProFormList(?:Wrapper)?[^]*?name=\"([^\"]+)\"[^]*?label=\"([^\"]+)\"[^]*?\/>/g;
  const listWithChildren = /<ProFormList(?:Wrapper)?[^]*?name=\"([^\"]+)\"[^]*?label=\"([^\"]+)\"[^]*?>([\s\S]*?)<\/ProFormList(?:Wrapper)?/g;
  let match;
  while ((match = formItemRegex.exec(content))) {
    const name = match[1];
    const label = match[2];
    const inner = match[3];
    const typeMatch = inner.match(/<([A-Za-z0-9_\.]+)/);
    const type = typeMatch ? typeMatch[1] : 'unknown';
    if (!result[formType]) result[formType] = [];
    const exists = result[formType].some((f) => f.name === name);
    if (!exists) {
      result[formType].push({ name, label, type });
    }
  }

  while ((match = listSelfClosing.exec(content))) {
    const name = match[1];
    const label = match[2];
    const type = 'ProFormList';
    if (!result[formType]) result[formType] = [];
    const exists = result[formType].some((f) => f.name === name);
    if (!exists) {
      result[formType].push({ name, label, type });
    }
  }

  while ((match = listWithChildren.exec(content))) {
    const name = match[1];
    const label = match[2];
    const type = 'ProFormList';
    if (!result[formType]) result[formType] = [];
    const exists = result[formType].some((f) => f.name === name);
    if (!exists) {
      result[formType].push({ name, label, type });
    }
  }
}

walk(dir);
fs.writeFileSync(
  path.resolve(__dirname, 'form_fields.json'),
  JSON.stringify(result, null, 2)
);
