/**
 * 打包浏览器端 client.js。
 *
 * DSH 浏览器插件不是普通 ESM：head 里的 bootstrap 先建一个队列
 *   window.__ModuleLoader__ = { mode: "queue", load(reg) { queue.push(reg) }, create(...) {...} }
 * 真正的模块系统在 create() 时对每个 registration 调 factory(require)，
 * 要求返回值带 apply / inject。所以必须输出 CJS，再套一层 ModuleLoader 壳。
 */
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(await readFile(path.join(here, 'package.json'), 'utf8'));
const css = await readFile(path.join(here, 'client.css'), 'utf8');

// CSS 作为字符串模块参与打包，运行时由 apply() 注入 <style>，避免单独请求静态文件。
await writeFile(
  path.join(here, 'styles.gen.js'),
  `// 由 build-client.mjs 自动生成，勿手改\nexport default ${JSON.stringify(css)};\n`
);

const result = await build({
  entryPoints: [path.join(here, 'client.jsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const code = result.outputFiles[0].text;
const indent = (source) =>
  source
    .split('\n')
    .map((line) => (line ? `    ${line}` : line))
    .join('\n');

const output = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${indent(code)}
    return module.exports;
  }
});
`;

await writeFile(path.join(here, 'client.js'), output);
console.log(`[build-client] client.js ${output.length} bytes, id=${pkg.name}`);
