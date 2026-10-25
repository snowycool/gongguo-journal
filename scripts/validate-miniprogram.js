const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const requiredFiles = [
  'project.config.json',
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/sitemap.json',
  'miniprogram/utils/date.js',
  'miniprogram/utils/store.js',
  'miniprogram/pages/today/index.js',
  'miniprogram/pages/today/index.json',
  'miniprogram/pages/today/index.wxml',
  'miniprogram/pages/today/index.wxss',
  'miniprogram/pages/ledger/index.js',
  'miniprogram/pages/ledger/index.json',
  'miniprogram/pages/ledger/index.wxml',
  'miniprogram/pages/ledger/index.wxss',
  'miniprogram/pages/vows/index.js',
  'miniprogram/pages/vows/index.json',
  'miniprogram/pages/vows/index.wxml',
  'miniprogram/pages/vows/index.wxss'
];

const errors = [];

for (const relative of requiredFiles) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) errors.push(`缺少文件：${relative}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = walk(miniRoot).concat(path.join(root, 'project.config.json'));

for (const file of files.filter((item) => item.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`JSON 无法解析：${path.relative(root, file)}：${error.message}`);
  }
}

const forbidden = /\b(document|window|localStorage|structuredClone)\b|Intl\.DateTimeFormat|\.at\s*\(/;
for (const file of files.filter((item) => item.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    new Function(source);
  } catch (error) {
    errors.push(`JS 语法错误：${path.relative(root, file)}：${error.message}`);
  }
  if (forbidden.test(source)) {
    errors.push(`发现浏览器专用 API：${path.relative(root, file)}`);
  }
}

function validateWxml(source, relative) {
  const stack = [];
  const tags = source.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  for (const raw of tags) {
    if (/^<\//.test(raw)) {
      const name = raw.match(/^<\/([a-zA-Z0-9-]+)/)[1];
      const open = stack.pop();
      if (open !== name) {
        errors.push(`WXML 标签不匹配：${relative}，期望 </${open || '无'}>，实际 </${name}>`);
        return;
      }
    } else if (!/\/>$/.test(raw)) {
      const name = raw.match(/^<([a-zA-Z0-9-]+)/)[1];
      stack.push(name);
    }
  }
  if (stack.length) errors.push(`WXML 标签未闭合：${relative}：${stack.join(', ')}`);
}

for (const file of files.filter((item) => item.endsWith('.wxml'))) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  validateWxml(source, relative);
  const pageScript = file.replace(/\.wxml$/, '.js');
  const scriptSource = fs.existsSync(pageScript) ? fs.readFileSync(pageScript, 'utf8') : '';
  const handlers = [...source.matchAll(/\b(?:bind|catch)(?:tap|input|submit|change|confirm)="([a-zA-Z_$][\w$]*)"/g)]
    .map((match) => match[1]);
  for (const handler of handlers) {
    if (!new RegExp(`\\b${handler}\\s*:`).test(scriptSource)) {
      errors.push(`WXML 事件未实现：${relative} -> ${handler}`);
    }
  }
}

for (const file of files.filter((item) => item.endsWith('.wxss'))) {
  const source = fs.readFileSync(file, 'utf8');
  let balance = 0;
  for (const char of source) {
    if (char === '{') balance += 1;
    if (char === '}') balance -= 1;
  }
  if (balance !== 0) errors.push(`WXSS 花括号不平衡：${path.relative(root, file)}：${balance}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`小程序静态校验通过：${files.length} 个源码文件。`);
