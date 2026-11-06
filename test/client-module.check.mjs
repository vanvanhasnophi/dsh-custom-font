// Loads the Client half exactly as the harness module loader would, with stubbed
// globals, and exercises `apply` against a recording fake context. This proves
// the load contract (id, factory signature, returned inject/apply), the
// stylesheet and locale registration effects, and the slot registration shape 鈥?// without a browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');

// ------------------------------------------------------------ browser stubs
const appended = [];
const makeElement = () => ({
  tagName: '',
  textContent: '',
  isConnected: false,
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  remove() {
    this.isConnected = false;
    const at = appended.indexOf(this);
    if (at !== -1) appended.splice(at, 1);
  },
});

const documentStub = {
  head: {
    appendChild(el) {
      el.isConnected = true;
      appended.push(el);
      return el;
    },
    // Minimal stand-in for the one selector the plugin uses: match style[attr="value"].
    querySelectorAll(selector) {
      const match = /^style\[([^\]=]+)="([^"]*)"\]$/.exec(selector);
      if (match === null) throw new Error(`unsupported selector in the stub: ${selector}`);
      const [, attribute, value] = match;
      return appended.filter((el) => el.tagName === 'style' && el.attributes[attribute] === value);
    },
  },
  createElement(tag) {
    const el = makeElement();
    el.tagName = tag;
    return el;
  },
};

const storage = new Map();
const localStorageStub = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
};

// React is only reached through `createElement`; `apply` never renders, so these
// are exercised only by the explicit component call at the end. The render sink
// is a property of the stub the vm realm closes over, so the test can reset it.
const ReactStub = {
  rendered: [],
  createElement: (type, props, ...children) => {
    ReactStub.rendered.push({ type, props, children });
    return { type, props, children };
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};

/**
 * Load the Client half into a fresh vm realm.
 * @returns the declaration handed to `window.__ModuleLoader__.load`.
 */
function loadDeclaration() {
  let loaded = null;
  const sandbox = {
    window: {
      localStorage: localStorageStub,
      document: documentStub,
      __ModuleLoader__: {
        load: (declaration) => {
          loaded = declaration;
        },
      },
    },
    document: documentStub,
    localStorage: localStorageStub,
    console,
    setTimeout,
    clearTimeout,
    URL,
    require: (specifier) => {
      if (specifier === 'react') return ReactStub;
      throw new Error(`unexpected require("${specifier}")`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  assert.notEqual(loaded, null, 'the module loader receives one declaration');
  return loaded;
}

const reactRequire = (specifier) => {
  if (specifier === 'react') return ReactStub;
  throw new Error(`unexpected require("${specifier}")`);
};

// ---------------------------------------------------------- load contract
const declaration = loadDeclaration();
assert.equal(declaration.id, 'dsh-font-stack', 'the loader id is the package name');
assert.equal(typeof declaration.factory, 'function', 'the declaration carries a factory');

const exported = declaration.factory(reactRequire);
// The declaration crosses a `vm` realm boundary, so compare contents, not identity.
assert.equal(exported.inject.join(','), 'slots,locale', 'the half injects only the services it uses');
assert.equal(typeof exported.apply, 'function', 'the factory returns an apply function');

// ------------------------------------------------------------- fake context
const effects = [];
const registered = [];
const localeRegistrations = [];
const slotsInjected = [];

const ctx = {
  effect(callback, label) {
    effects.push({ label, disposer: callback() });
    return () => {};
  },
  slots: {
    inject(key, callback) {
      slotsInjected.push(key);
      callback();
      return () => {};
    },
    register(options, component) {
      registered.push({ options, component });
      return () => {};
    },
  },
  locale: {
    register(ns, dicts) {
      localeRegistrations.push({ ns, dicts });
      return () => {};
    },
    bind(ns) {
      return (key) => `t:${key}`;
    },
  },
};

// ---------------------------------------------- fresh install (nothing stored)
exported.apply(ctx);

assert.equal(slotsInjected.join(','), 'settings.general.item', 'the row targets Settings -> General');
assert.equal(registered.length, 1, 'exactly one row is registered');
assert.equal(registered[0].options.name, 'settings.general.item', 'the registration names the slot');
assert.equal(registered[0].options.id, 'font-stack', 'the row uses its own cell id, not a shipped one');
assert.equal(typeof registered[0].options.order, 'number', 'the row declares an order');
assert.equal(typeof registered[0].options.label, 'function', 'the row label is a thunk so it follows the locale');
assert.equal(registered[0].options.label(), 't:row.title', 'the label resolves through the locale namespace');

assert.equal(localeRegistrations.length, 1, 'one locale namespace is registered');
assert.equal(localeRegistrations[0].ns, 'settings.font-stack', 'the locale namespace is plugin-scoped');
const { zh, en } = localeRegistrations[0].dicts;
assert.equal(Object.keys(zh).sort().join(','), Object.keys(en).sort().join(','), 'zh and en cover the same keys');
assert.ok(Object.keys(zh).length >= 15, 'the row ships its whole copy');

const effectLabels = effects.map((entry) => entry.label);
assert.ok(effectLabels.some((label) => label.includes('live font stylesheet')), 'a live-stylesheet effect is registered');
assert.ok(effectLabels.some((label) => label.includes('row stylesheet')), 'a row-stylesheet effect is registered');

const styleTags = appended.filter((el) => el.tagName === 'style');
assert.equal(styleTags.length, 1, 'exactly one owned stylesheet is inserted');
const rowStyle = styleTags[0];
assert.equal(rowStyle.attributes['data-plugin-css'], 'dsh-font-stack/row', 'the row stylesheet is namespaced');
assert.ok(rowStyle.textContent.includes('.dfsInput'), 'the row stylesheet styles its own controls');
assert.ok(!/color\s*:\s*#/.test(rowStyle.textContent), 'the row stylesheet never hard-codes a color');
assert.ok(rowStyle.textContent.includes('var(--dsw-alias-label-primary)'), 'the row reads theme tokens');
assert.equal(
  appended.filter((el) => el.attributes['data-plugin-css'] === 'dsh-font-stack/live').length,
  0,
  'a fresh install injects no font sheet',
);

// ------------------------------------------- stored + enabled paints at boot
storage.set(
  'dsh-font-stack:prefs',
  JSON.stringify({
    enabled: true,
    uiFont: 'Inter, sans-serif',
    monoFont: '"JetBrains Mono", monospace',
    force: false,
  }),
);
const effectsBefore = effects.length;
const secondExported = loadDeclaration().factory(reactRequire);
appended.length = 0;
secondExported.apply(ctx);

const liveSheet = appended.find((el) => el.attributes['data-plugin-css'] === 'dsh-font-stack/live');
assert.notEqual(liveSheet, undefined, 'an enabled stored section paints at boot, before the settings panel opens');
assert.ok(
  liveSheet.textContent.startsWith('html, body {'),
  'the live sheet grounds its variables on body, where 0.2.2 re-derives the font tokens',
);
assert.ok(
  liveSheet.textContent.includes('--dsh-font-family-text: Inter, sans-serif !important;'),
  'the boot sheet carries the stored text font-list hook',
);
assert.ok(
  liveSheet.textContent.includes('--dsw-font-family: Inter, sans-serif !important;'),
  'the boot sheet carries the stored UI stack',
);
assert.ok(
  liveSheet.textContent.includes('--dsh-font-family-code: "JetBrains Mono", monospace !important;'),
  'the boot sheet carries the stored code font-list hook',
);
assert.ok(
  liveSheet.textContent.includes('--ds-font-family-code: "JetBrains Mono", monospace !important;'),
  'the boot sheet carries the stored mono stack',
);
assert.ok(effects.length > effectsBefore, 'the second load registers its own effects');

// Dispose the live sheet and confirm it leaves the document.
const liveDisposers = effects.filter((entry) => entry.label.includes('live font stylesheet'));
assert.equal(liveDisposers.length >= 1, true, 'the live stylesheet effect is registered');
for (const entry of liveDisposers) entry.disposer();
assert.equal(
  appended.filter((el) => el.attributes['data-plugin-css'] === 'dsh-font-stack/live').length,
  0,
  'disposal removes the live font sheet',
);

// ---------------------------------------------------------------- component
const component = registered[0].component;
assert.equal(typeof component, 'function', 'the slot receives a component');

/** Flatten a rendered element tree, invoking nested function components. */
function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (typeof node.type === 'function') {
    flatten(node.type(node.props ?? {}), out);
    return out;
  }
  out.push({ type: node.type, props: node.props ?? {} });
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

// Empty in place: the stub closes over this exact array.
ReactStub.rendered.length = 0;
// React would call the returned element's function components; do the same.
const element = component({});
assert.equal(typeof element.type, 'function', 'the slot component returns the row component');
const nodes = flatten(element.type(element.props));
assert.ok(nodes.length > 0, 'the row component builds an element tree');
assert.ok(nodes.map((node) => node.type).includes('div'), 'the row renders a container');

const textInputs = nodes.filter((node) => node.type === 'input' && node.props.type === 'text');
assert.equal(textInputs.length, 2, 'the row renders exactly the UI and mono inputs');
assert.equal(textInputs[0].props.value, 'Inter, sans-serif', 'the UI input shows the stored stack');
assert.equal(textInputs[1].props.value, '"JetBrains Mono", monospace', 'the mono input shows the stored stack');

const checkboxes = nodes.filter((node) => node.type === 'input' && node.props.type === 'checkbox');
assert.equal(checkboxes.length, 2, 'the row offers the enable and force switches');
assert.equal(checkboxes[0].props.checked, true, 'the enable switch reflects the stored preference');
assert.equal(checkboxes[1].props.checked, false, 'the force switch reflects the stored preference');

const buttons = nodes.filter((node) => node.type === 'button');
assert.equal(buttons.length, 5, 'the row offers four preset chips and a reset button');

console.log('all client-half checks passed');
