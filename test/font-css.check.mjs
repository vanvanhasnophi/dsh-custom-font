// Behavioural checks for dsh-font-stack's pure helpers, run against the real
// source modules (no duplicated logic). The Host half is import-free by design,
// so it can be loaded straight into the dev runtime.
import assert from 'node:assert/strict';
import { buildFontCss, sanitizeFontStack } from '../src/host.js';
import { readFileSync } from 'node:fs';

assert.equal(typeof buildFontCss, 'function', 'buildFontCss must be exported');
assert.equal(typeof sanitizeFontStack, 'function', 'sanitizeFontStack must be exported');

// ---------------------------------------------------------------- sanitizing
assert.equal(
  sanitizeFontStack('"JetBrains Mono", Consolas, monospace'),
  '"JetBrains Mono", Consolas, monospace',
  'a quoted multi-word stack passes through',
);
assert.equal(sanitizeFontStack('  Inter,\n   sans-serif  '), 'Inter, sans-serif', 'whitespace collapses to one line');
assert.equal(sanitizeFontStack('Inter; background: red'), 'Inter background red', 'a terminator cannot survive');
assert.equal(sanitizeFontStack('Inter} body{display:none'), 'Inter bodydisplaynone', 'braces cannot open a nested rule');
assert.equal(sanitizeFontStack('@import x <b>Inter'), 'import x bInter', 'at-rules and angle brackets are removed');
assert.equal(sanitizeFontStack('Inter: hover'), 'Inter hover', 'a colon cannot start a declaration');
assert.equal(sanitizeFontStack(',Inter,,'), 'Inter', 'leading and trailing separators are dropped');
assert.equal(sanitizeFontStack(' , , '), '', 'a separator-only stack is empty');
assert.equal(sanitizeFontStack(undefined), '', 'a non-string is rejected');
assert.equal(sanitizeFontStack('Inter  Sans'), 'Inter Sans', 'inner runs collapse to exactly one space');

// ------------------------------------------------------------------- off/empty
assert.equal(buildFontCss({ enabled: false, uiFont: 'Inter', monoFont: 'Menlo' }), '', 'disabled emits nothing');
assert.equal(buildFontCss(null), '', 'null emits nothing');
assert.equal(buildFontCss('nope'), '', 'a non-object emits nothing');
assert.equal(buildFontCss({ enabled: true }), '', 'enabled with no stacks emits nothing');
assert.equal(buildFontCss({ enabled: true, uiFont: '  ', monoFont: ',' }), '', 'blank stacks emit nothing');

// --------------------------------------------------------------------- output
const both = buildFontCss({
  enabled: true,
  uiFont: 'Inter, sans-serif',
  monoFont: '"JetBrains Mono", monospace',
  force: false,
});
assert.ok(
  both.includes('--dsh-font-family-text: Inter, sans-serif !important;'),
  'declares the 0.2.2 text font-list hook',
);
assert.ok(
  both.includes('--dsh-font-family-code: "JetBrains Mono", monospace !important;'),
  'declares the 0.2.2 code font-list hook',
);
assert.ok(both.includes('--ds-font-family-code: "JetBrains Mono", monospace !important;'), 'declares the mono variable');
assert.ok(
  both.includes('--dsw-font-markdown-code-font-family: "JetBrains Mono", monospace !important;'),
  'declares the markdown code variable',
);
assert.ok(both.includes('--dsw-font-family: Inter, sans-serif !important;'), 'declares the UI variable');
assert.ok(both.startsWith('html, body {'), 'the variable rule is grounded on body too, not html alone');
assert.ok(
  /^html, body \{\n[\s\S]*--dsw-font-family: Inter, sans-serif !important;/.test(both),
  'the body-level variable rule is what makes 0.2.2 conversation content follow the stack',
);
assert.ok(both.includes('html, body { font-family: Inter, sans-serif; }'), 'grades the UI stack on html and body');
assert.ok(!both.includes('!important; }'), 'does not force without the flag');
assert.equal(both.split('{').length - 1, 2, 'emits exactly the two intended rules');

const forced = buildFontCss({ enabled: true, uiFont: 'Inter', monoFont: '', force: true });
assert.ok(forced.includes('html, body { font-family: Inter !important; }'), 'forces the UI rule only when asked');
assert.ok(forced.includes('--dsh-font-family-text: Inter !important;'), 'still declares the text hook when forced');
assert.ok(!forced.includes('--dsh-font-family-code'), 'omits the code hook when the mono field is empty');

const uiOnly = buildFontCss({ enabled: true, uiFont: 'Inter', monoFont: '' });
assert.ok(uiOnly.includes('--dsw-font-family: Inter !important;'), 'still emits the UI variable alone');
assert.ok(uiOnly.includes('--dsh-font-family-text: Inter !important;'), 'still emits the text hook alone');
assert.ok(!uiOnly.includes('--ds-font-family-code:'), 'omits the mono variable when the mono field is empty');

const monoOnly = buildFontCss({ enabled: true, uiFont: '', monoFont: 'Menlo' });
assert.ok(!monoOnly.includes('--dsh-font-family-text:'), 'omits the text hook when the UI field is empty');
assert.ok(!monoOnly.includes('--dsw-font-family:'), 'omits the UI variable when the UI field is empty');
assert.ok(!monoOnly.includes('html, body { font-family:'), 'skips the UI family rule when the UI field is empty');
assert.ok(monoOnly.includes('--dsh-font-family-code: Menlo !important;'), 'keeps the code hook alone');
assert.ok(monoOnly.includes('--ds-font-family-code: Menlo !important;'), 'keeps the mono variable alone');

// ------------------------------------------------------------ injection safety
// A hostile value must never escape its declaration. Every structural character
// is removed, so the residue is inert text inside the declaration it was put in
// and can never add a selector or a property of its own.
const hostile = buildFontCss({
  enabled: true,
  uiFont: 'Inter; } html { background: url(evil) }',
  monoFont: 'Menlo',
});
assert.ok(!/}\s*html\s*\{\s*background/.test(hostile), 'a hostile stack cannot open a new rule');
assert.ok(!hostile.includes('background:'), 'a hostile stack cannot declare a property');
assert.equal(hostile.split('{').length - 1, 2, 'no extra rule braces appear');
assert.ok(
  hostile.includes('--dsh-font-family-text: Inter html background url(evil) !important;'),
  'the residue is inert text inside the text hook',
);
assert.ok(
  hostile.includes('--dsw-font-family: Inter html background url(evil) !important;'),
  'the residue is inert text inside the UI variable',
);
assert.ok(
  hostile.includes('html, body { font-family: Inter html background url(evil); }'),
  'the residue is inert text inside the UI family rule',
);
assert.ok(hostile.includes('--ds-font-family-code: Menlo !important;'), 'the mono declaration is untouched beside it');

// ------------------------------------------------- manifest and half agreement
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.dsh.client.platform, 'web', 'the Client half is a web-platform module');
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots'), 'injects the slots package');
assert.equal(manifest.main ?? manifest.exports['.'], './src/host.js', 'the Host entry is the dependency-free half');
assert.deepEqual(manifest.dependencies ?? {}, {}, 'the plugin must ship no runtime dependencies');

// The Client half cannot be imported into Node (it needs the browser module
// loader), so its copy is compared TEXTUALLY against the canonical Host source:
// the two halves must stay byte-identical, or a live edit and a stored reload
// would disagree.
const hostSource = readFileSync(new URL('../src/host.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');

/**
 * Pull one function declaration out of a source file, verbatim.
 * @param source - the file text.
 * @param name - the function name.
 * @returns the full declaration text.
 */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must be declared`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    else if (source[at] === '}') {
      depth -= 1;
      if (depth === 0) {
        // Include the closing `}` and swallow a single trailing newline.
        return source.slice(start, at + 1);
      }
    }
  }
  throw new Error(`unterminated function ${name}`);
}

/**
 * Compare code only: strip comments, then de-indent, so the two halves' differing
 * block indentation and their own prose comments do not matter — but every
 * statement, literal, and regex must match exactly.
 */
const normalize = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');

for (const name of ['sanitizeFontStack', 'buildFontCss']) {
  assert.equal(
    normalize(extractFunction(clientSource, name)),
    normalize(extractFunction(hostSource, name)),
    `the Client half's ${name} must match the canonical Host implementation`,
  );
}
assert.ok(clientSource.includes('const UNSAFE_CSS = /[;:{}<>@]/g;'), 'the character class matches on both halves');
assert.ok(clientSource.includes('--dsh-font-family-text:'), 'the Client half declares the 0.2.2 text hook');
assert.ok(clientSource.includes('--dsh-font-family-code:'), 'the Client half declares the 0.2.2 code hook');
assert.ok(clientSource.includes('--ds-font-family-code:'), 'the Client half declares the same mono variable');
assert.ok(clientSource.includes('--dsw-font-markdown-code-font-family:'), 'the Client half declares the same markdown code variable');
assert.ok(clientSource.includes('html, body { font-family:'), 'the Client half declares the same UI family rule');
assert.ok(clientSource.includes('html, body {\\n'), 'the Client half grounds its variables on html and body');

console.log('all checks passed');
