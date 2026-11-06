/**
 * Host half of `dsh-font-stack`.
 *
 * The Host owns no state and injects no markup. The font preferences live in
 * the browser (see `./client.js`), because a profile-installed plugin that is
 * linked from a workspace directory cannot rely on its own npm dependencies
 * being installed into the profile — pnpm records a `link:` dependency without
 * resolving the linked package's own dependencies. Keeping the Host half
 * dependency-free is what lets this bundle install and activate anywhere.
 *
 * The row still needs a Host plugin entry: the bundle patch inserts one, and an
 * entry with no `Config` export is a valid no-op Host plugin. That entry is also
 * what the Client half resolves as its settings-panel anchor.
 *
 * @module dsh-font-stack
 */

/** Profile plugin entry id; also this plugin's `localStorage` namespace. */
export const FONT_NAMESPACE = 'dsh-font-stack';

/**
 * Stock UI font stack, mirrored from `--dsw-font-family` in the harness base
 * sheet shipped by `@deepseek-ai/dsh-client-ui-theme` (`styles/base.css`).
 */
export const DEFAULT_UI_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Stock monospace stack, mirrored from `--ds-font-family-code` in the same sheet.
 */
export const DEFAULT_MONO_FONT =
  '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"';

/**
 * Characters that could terminate a declaration, open a new rule/CSS value, or
 * — via `:` — let sanitized residue read as a further declaration.
 */
const UNSAFE_CSS = /[;:{}<>@]/g;

/**
 * Normalize a user-typed CSS font-family list for safe interpolation into a
 * stylesheet: one line, no comment or rule terminators. Quoted family names,
 * generic keywords, and multi-word sequences all survive untouched.
 * Whitespace is collapsed a second time because removing a structural character
 * between two spaces would otherwise leave a double space behind.
 * @param value - the raw form value.
 * @returns the sanitized single-line stack, or an empty string when unusable.
 */
export function sanitizeFontStack(value) {
  if (typeof value !== 'string') return '';
  const flat = value
    .replace(/\s+/g, ' ')
    .replace(UNSAFE_CSS, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A stack must not start or end with a separator, and a lone separator is empty.
  return flat.replace(/^[,]+/, '').replace(/[,]+$/, '').trim();
}

/**
 * Build the font override stylesheet for one preferences snapshot.
 *
 * The sheet writes both generations of Harness font variables, on `html, body`:
 *
 * - `--dsw-font-family` and `--ds-font-family-code` are the tokens every
 *   shipped component reads. Up to 0.2.1 the base sheet declared them on
 *   `:root`, so a value on `html` reached the whole document. 0.2.2 re-derives
 *   them on `body` from the user font-list hooks, and a declaration on `body`
 *   beats an inherited value from `html` no matter how important the latter is.
 *   Writing the same tokens on `body` again, with `!important`, outranks that
 *   `body` rule and restores the override for the composer and Markdown replies.
 * - `--dsh-font-family-text` and `--dsh-font-family-code` are the 0.2.2 user
 *   font-list hooks. The native Font settings write them inline on `body`;
 *   writing them here keeps this plugin authoritative when both surfaces are
 *   used, and keeps every consumer that re-derives from the hooks in step.
 *
 * `font-family` is re-stated on `html, body` for elements that read neither
 * token, and because Markdown headings use the `font:` shorthand (which does
 * not inherit).
 *
 * Deliberately untouched: KaTeX's own math faces (`.katex` sets its family
 * without `!important`, so forcing a family on descendants would break formulas)
 * and xterm's glyph-metric rendering. Since 0.2.2 the terminal font comes from
 * the Host settings store directly, not from CSS, so this plugin still cannot
 * change it.
 *
 * This is the canonical implementation, exercised by `test/font-css.check.mjs`.
 * The Client half carries a byte-identical copy because `window.__ModuleLoader__`
 * exposes no relative import; that test fails if the two ever drift apart.
 * @param preferences - the live preference values.
 * @returns a stylesheet string, or an empty string when nothing is overridden.
 */
export function buildFontCss(preferences) {
  if (preferences === null || typeof preferences !== 'object') return '';
  if (preferences.enabled !== true) return '';
  const ui = sanitizeFontStack(preferences.uiFont);
  const mono = sanitizeFontStack(preferences.monoFont);
  if (ui === '' && mono === '') return '';

  const declarations = [];
  if (ui !== '') {
    declarations.push(`  --dsh-font-family-text: ${ui} !important;`);
    declarations.push(`  --dsw-font-family: ${ui} !important;`);
  }
  if (mono !== '') {
    declarations.push(`  --dsh-font-family-code: ${mono} !important;`);
    declarations.push(`  --ds-font-family-code: ${mono} !important;`);
    declarations.push(`  --dsw-font-markdown-code-font-family: ${mono} !important;`);
  }

  const rules = [`html, body {\n${declarations.join('\n')}\n}`];
  if (ui !== '') {
    rules.push(`html, body { font-family: ${ui}${preferences.force === true ? ' !important' : ''}; }`);
  }
  return rules.join('\n');
}

/**
 * No host-side work: everything this plugin does happens in the browser half, so
 * the desktop shell and the browser shell behave identically. The helpers above
 * exist for verification and documentation; the Host never calls them.
 * @param _ctx - Host plugin context (unused).
 */
export function apply(_ctx) {}
