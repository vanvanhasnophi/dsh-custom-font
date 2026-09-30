/**
 * Client half of `dsh-font-stack`.
 *
 * This half does all the work, in two parts:
 *
 * 1. It owns the preferences (a small `localStorage` section) and keeps a
 *    stylesheet of its own in `document.head`, re-applied on every edit. That
 *    sheet is what actually re-fonts the running shell — the desktop window and
 *    the browser tab alike, since both render this same Web UI.
 * 2. It contributes the font row to Settings -> General: the interface stack,
 *    the monospace stack, quick presets, an escape hatch, a live preview, and a
 *    reset.
 *
 * Why not a Host-backed `Config`: a profile-installed plugin linked from a
 * workspace directory cannot rely on its own npm dependencies, because pnpm
 * records a `link:` dependency without resolving the linked package's
 * dependencies — so a `Config` schema (which needs `schemastery`) would fail to
 * import in a profile the plugin was installed into. Keeping the Host half
 * dependency-free is what makes this bundle installable anywhere.
 *
 * The row renders plain elements styled with harness theme tokens; it imports no
 * harness Client UI package.
 *
 * @module dsh-font-stack/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-font-stack',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState } = React;

    /** Profile plugin entry id: the Host Config namespace this row edits. */
    const FONT_NAMESPACE = 'dsh-font-stack';
    /** Locale namespace for this row's copy. */
    const LOCALE_NS = 'settings.font-stack';
    /** `localStorage` key holding the whole preferences section. */
    const STORAGE_KEY = `${FONT_NAMESPACE}:prefs`;
    /** Row position: directly after the shipped Appearance (10) and Font size (11) rows. */
    const ROW_ORDER = 12;

    /**
     * Stock UI stack, mirrored from `--dsw-font-family` in the harness base
     * sheet shipped by `@deepseek-ai/dsh-client-ui-theme` (`styles/base.css`).
     */
    const DEFAULT_UI_FONT =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

    /** Stock monospace stack, mirrored from the harness base sheet. */
    const DEFAULT_MONO_FONT =
      '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"';

    /** One-click stacks; `value` is always a standard CSS font-family list. */
    const PRESETS = [
      {
        id: 'system-ui',
        ui: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        mono: 'ui-monospace, "Cascadia Code", Consolas, "SF Mono", Menlo, monospace',
      },
      {
        id: 'inter',
        ui: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        mono: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      },
      {
        id: 'cjk',
        ui: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
        mono: '"Sarasa Mono SC", "Cascadia Code", Consolas, "Microsoft YaHei", monospace',
      },
      {
        id: 'serif',
        ui: 'Georgia, "Songti SC", SimSun, "Times New Roman", serif',
        mono: '"Cascadia Code", Consolas, "Courier New", monospace',
      },
    ];

    /** Simplified Chinese copy (key-set source of truth). */
    const zh = {
      'row.title': '字体',
      'row.description': '用标准 CSS 字体栈覆盖界面与等宽字体，Web 与桌面端同时生效。',
      'row.enable': '启用自定义字体',
      'row.enabled': '已启用',
      'row.disabled': '已关闭（保持默认）',
      'row.ui': '界面字体栈',
      'row.uiHint': '界面正文、侧边栏与设置页面使用。',
      'row.mono': '等宽字体栈',
      'row.monoHint': '代码块与行内代码使用。',
      'row.reset': '恢复默认',
      'row.presets': '快速预设',
      'row.preview': '预览',
      'row.previewText': '字体预览 Sample 0123',
      'row.force': '强制覆盖组件字体',
      'row.forceHint': '仅在所选字体没有生效时打开：它会用 !important 顶开组件自身的字体规则。',
      'row.empty': '留空表示该项保持默认。',
      'preset.system-ui': '系统默认',
      'preset.inter': 'Inter',
      'preset.cjk': '中文优先',
      'preset.serif': '衬线',
    };

    /** English copy, checked complete against the zh key set. */
    const en = {
      'row.title': 'Fonts',
      'row.description':
        'Override the interface and monospace fonts with any standard CSS font stack. Applies to both the Web and desktop shells.',
      'row.enable': 'Use custom fonts',
      'row.enabled': 'Enabled',
      'row.disabled': 'Off (shipped defaults)',
      'row.ui': 'Interface font stack',
      'row.uiHint': 'Used by body copy, the sidebar, and settings pages.',
      'row.mono': 'Monospace font stack',
      'row.monoHint': 'Used by code blocks and inline code.',
      'row.reset': 'Reset to defaults',
      'row.presets': 'Presets',
      'row.preview': 'Preview',
      'row.previewText': 'Font preview Sample 0123',
      'row.force': 'Force past component font rules',
      'row.forceHint':
        'Turn on only when the chosen font does not take effect: it overrides component font rules with !important.',
      'row.empty': 'Leave a field empty to keep its shipped default.',
      'preset.system-ui': 'System',
      'preset.inter': 'Inter',
      'preset.cjk': 'CJK first',
      'preset.serif': 'Serif',
    };

    /** Style-sheet field name for this plugin's owned stylesheet. */
    const CSS_ATTR = 'data-plugin-css';

    /** Attribute value naming this half's live font sheet. */
    const LIVE_SHEET = `${FONT_NAMESPACE}/live`;

    /** Style element this half owns; replaced whenever the preferences change. */
    let liveStyle = null;

    /**
     * Drop every live sheet in the document, including one left behind by a
     * previous module generation (HMR and module reloads re-run this file, which
     * resets the module-level handle without disposing the old node).
     * @returns the sheet node to reuse, or null when none remains.
     */
    function reclaimLiveSheets() {
      if (typeof document === 'undefined') return null;
      const existing = document.head.querySelectorAll(`style[${CSS_ATTR}="${LIVE_SHEET}"]`);
      let kept = null;
      for (const node of existing) {
        if (kept === null) kept = node;
        else node.remove();
      }
      liveStyle = kept;
      return kept;
    }

    /**
     * Characters that could terminate a declaration, open a new rule/CSS value,
     * or — via `:` — let sanitized residue read as a further declaration.
     */
    const UNSAFE_CSS = /[;:{}<>@]/g;

    /**
     * Normalize one user-typed stack for safe interpolation into a stylesheet.
     * Kept in step with the Host half's `sanitizeFontStack`.
     * @param value - the raw form value.
     * @returns the sanitized single-line stack, or an empty string when unusable.
     */
    function sanitizeFontStack(value) {
      if (typeof value !== 'string') return '';
      const flat = value
        .replace(/\s+/g, ' ')
        .replace(UNSAFE_CSS, '')
        .replace(/\s+/g, ' ')
        .trim();
      return flat.replace(/^[,]+/, '').replace(/[,]+$/, '').trim();
    }

    /**
     * Build the override stylesheet for one preferences snapshot. Byte-identical
     * to the canonical Host implementation; `test/font-css.check.mjs` fails if the
     * two ever drift apart.
     * @param preferences - current preference values.
     * @returns a stylesheet string, or an empty string when nothing is overridden.
     */
    function buildFontCss(preferences) {
      if (preferences === null || typeof preferences !== 'object') return '';
      if (preferences.enabled !== true) return '';
      const ui = sanitizeFontStack(preferences.uiFont);
      const mono = sanitizeFontStack(preferences.monoFont);
      if (ui === '' && mono === '') return '';

      const declarations = [];
      if (mono !== '') {
        declarations.push(`  --ds-font-family-code: ${mono} !important;`);
        declarations.push(`  --dsw-font-markdown-code-font-family: ${mono} !important;`);
      }
      if (ui !== '') declarations.push(`  --dsw-font-family: ${ui} !important;`);

      const rules = [`html {\n${declarations.join('\n')}\n}`];
      if (ui !== '') {
        rules.push(`html, body { font-family: ${ui}${preferences.force === true ? ' !important' : ''}; }`);
      }
      return rules.join('\n');
    }

    /**
     * Swap the owned stylesheet for the given preferences. Called on every edit
     * and at plugin boot, so the change reaches the page without a reload.
     * @param preferences - current preference values.
     */
    function applyLiveFontCss(preferences) {
      if (typeof document === 'undefined') return;
      const css = buildFontCss(preferences);
      if (css === '') {
        const node = reclaimLiveSheets();
        if (node !== null) node.remove();
        liveStyle = null;
        return;
      }
      const node = liveStyle !== null && liveStyle.isConnected === true ? liveStyle : reclaimLiveSheets();
      if (node === null || node.isConnected !== true) {
        liveStyle = document.createElement('style');
        liveStyle.setAttribute(CSS_ATTR, LIVE_SHEET);
        document.head.appendChild(liveStyle);
      }
      if (liveStyle.textContent !== css) liveStyle.textContent = css;
    }

    /** Default preferences: inactive, with the shipped stacks as the starting text. */
    function defaultDrafts() {
      return { enabled: false, uiFont: DEFAULT_UI_FONT, monoFont: DEFAULT_MONO_FONT, force: false };
    }

    /**
     * Fold any stored/foreign value into complete preferences, so a partial or
     * hand-edited section can never produce half-empty inputs.
     * @param value - the parsed stored section, or anything else.
     * @returns complete preferences.
     */
    function foldValue(value) {
      const base = defaultDrafts();
      if (value === null || typeof value !== 'object') return base;
      const source = value;
      return {
        enabled: source.enabled === true,
        uiFont: typeof source.uiFont === 'string' ? source.uiFont : base.uiFont,
        monoFont: typeof source.monoFont === 'string' ? source.monoFont : base.monoFont,
        force: source.force === true,
      };
    }

    /**
     * Read the stored preferences, tolerating absent, corrupt, or blocked
     * storage (a privacy mode that denies `localStorage` must not break the row).
     * @returns complete preferences.
     */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return defaultDrafts();
        return foldValue(JSON.parse(raw));
      } catch (_storageUnavailable) {
        return defaultDrafts();
      }
    }

    /**
     * Persist the preferences. Best-effort: a blocked or full storage keeps the
     * choice for this session only instead of throwing through the row.
     * @param drafts - the preferences to store.
     */
    function writePrefs(drafts) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
      } catch (_storageUnavailable) {
        /* the live stylesheet still carries the choice for this session */
      }
    }

    /**
     * Render a small inline action button.
     * @param props - label, disabled state, and click handler.
     * @returns the button element.
     */
    function SmallButton(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dfsBtn',
          disabled: props.disabled === true,
          onClick: props.onClick,
        },
        props.label,
      );
    }

    /**
     * Render a monospace preview line with an explicit family, so the user sees
     * the stack even before it is saved.
     * @param props - the family to preview and the sample text.
     * @returns the preview element.
     */
    function Preview(props) {
      return h(
        'div',
        { className: 'dfsPreview', style: { fontFamily: props.family === '' ? undefined : props.family } },
        props.text,
      );
    }

    /**
     * The Settings -> General font row.
     * @param props - the bound translate function.
     * @returns the row element tree.
     */
    function FontRow(props) {
      const t = props.t;
      // The preferences ARE this component's state: the initializer reads the
      // stored section, and every edit writes it back.
      const [drafts, setDrafts] = useState(readPrefs);

      const commit = (next) => {
        setDrafts(next);
        applyLiveFontCss(next);
        writePrefs(next);
      };

      const update = (field, value) => commit({ ...drafts, [field]: value });

      const reset = () => commit(defaultDrafts());

      const applyPreset = (preset) => commit({ ...drafts, uiFont: preset.ui, monoFont: preset.mono });

      const uiDraft = drafts.uiFont;
      const monoDraft = drafts.monoFont;
      const uiFamily = sanitizeFontStack(uiDraft);
      const monoFamily = sanitizeFontStack(monoDraft);

      return h(
        'div',
        { className: 'dfsGroup' },
        h(
          'div',
          { className: 'dfsHead' },
          h('div', { className: 'dfsTitle' }, t('row.title')),
          h(
            'div',
            { className: 'dfsStatus' },
            drafts.enabled ? t('row.enabled') : t('row.disabled'),
          ),
        ),
        h('div', { className: 'dfsDesc' }, t('row.description')),

        h(
          'label',
          { className: 'dfsSwitch' },
          h('input', {
            type: 'checkbox',
            checked: drafts.enabled,
            onChange: (event) => update('enabled', event.target.checked === true),
          }),
          h('span', null, t('row.enable')),
        ),

        h(
          'div',
          { className: 'dfsPresets' },
          h('span', { className: 'dfsPresetsLabel' }, t('row.presets')),
          ...PRESETS.map((preset) =>
            h(
              'button',
              {
                key: preset.id,
                type: 'button',
                className: 'dfsChip',
                onClick: () => applyPreset(preset),
              },
              t(`preset.${preset.id}`),
            ),
          ),
        ),

        h(
          'div',
          { className: 'dfsField' },
          h('label', { className: 'dfsLabel', htmlFor: 'dfs-ui' }, t('row.ui')),
          h('div', { className: 'dfsHint' }, t('row.uiHint')),
          h('input', {
            id: 'dfs-ui',
            className: 'dfsInput',
            type: 'text',
            spellCheck: false,
            autoComplete: 'off',
            value: uiDraft,
            placeholder: DEFAULT_UI_FONT,
            onChange: (event) => update('uiFont', event.target.value),
          }),
        ),

        h(
          'div',
          { className: 'dfsField' },
          h('label', { className: 'dfsLabel', htmlFor: 'dfs-mono' }, t('row.mono')),
          h('div', { className: 'dfsHint' }, t('row.monoHint')),
          h('input', {
            id: 'dfs-mono',
            className: 'dfsInput',
            type: 'text',
            spellCheck: false,
            autoComplete: 'off',
            value: monoDraft,
            placeholder: DEFAULT_MONO_FONT,
            onChange: (event) => update('monoFont', event.target.value),
          }),
        ),

        h(
          'label',
          { className: 'dfsSwitch' },
          h('input', {
            type: 'checkbox',
            checked: drafts.force,
            onChange: (event) => update('force', event.target.checked === true),
          }),
          h('span', null, t('row.force')),
        ),
        h('div', { className: 'dfsHint' }, t('row.forceHint')),

        h(
          'div',
          { className: 'dfsPreviewBox' },
          h('div', { className: 'dfsHint' }, t('row.preview')),
          h(Preview, { family: uiFamily, text: t('row.previewText') }),
          h(Preview, {
            family: monoFamily,
            text: 'const font = "Consolas"; // 0123456789',
          }),
        ),
        h('div', { className: 'dfsHint' }, t('row.empty')),

        h(
          'div',
          { className: 'dfsActions' },
          h(SmallButton, { label: t('row.reset'), onClick: reset }),
        ),
      );
    }

    /**
     * This plugin's own stylesheet: theme tokens only, so the row matches the
     * shipped settings rows in both palettes and follows the user's font choice.
     */
    const ROW_CSS = `
.dfsGroup { display: flex; flex-direction: column; gap: 8px; }
.dfsHead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dfsTitle { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 500; line-height: 22px; }
.dfsStatus { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dfsDesc, .dfsHint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dfsSwitch { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; cursor: pointer; }
.dfsSwitch input { accent-color: var(--dsw-alias-brand-primary); margin: 0; }
.dfsPresets { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.dfsPresetsLabel { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dfsChip, .dfsBtn {
  appearance: none; font: inherit; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-elevated-fill, transparent);
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xs, 4px);
  padding: 3px 10px; cursor: pointer;
}
.dfsChip:hover, .dfsBtn:hover { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-bg-layer-2)); }
.dfsChip:focus-visible, .dfsBtn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 2px; }
.dfsBtn:disabled { opacity: 0.5; cursor: default; }
.dfsField { display: flex; flex-direction: column; gap: 4px; }
.dfsLabel { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
.dfsInput {
  box-sizing: border-box; width: 100%; font: inherit; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 8px);
  padding: 6px 10px;
}
.dfsInput:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 1px; }
.dfsPreviewBox {
  display: flex; flex-direction: column; gap: 6px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm, 8px);
  padding: 10px 12px;
}
.dfsPreview { color: var(--dsw-alias-label-primary); font-size: 15px; line-height: 24px; overflow-wrap: anywhere; }
.dfsActions { display: flex; gap: 8px; padding-top: 2px; }
`;

    /** Required services: the additive General row seat and the locale registry. */
    const inject = ['slots', 'locale'];

    /**
     * Client plugin body.
     * @param ctx - Client cordis context.
     */
    function apply(ctx) {
      // Apply the stored preferences as early as the plugin boots, so both the
      // desktop shell and the browser shell paint with the chosen font.
      applyLiveFontCss(readPrefs());

      // Keep the live sheet authoritative for the whole plugin lifetime: the row
      // is unmounted while the settings panel is closed, the font must not be.
      ctx.effect(
        () => () => {
          const node = reclaimLiveSheets();
          if (node !== null) node.remove();
          liveStyle = null;
        },
        'dsh-font-stack: live font stylesheet',
      );

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.setAttribute(CSS_ATTR, `${FONT_NAMESPACE}/row`);
        tag.textContent = ROW_CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'dsh-font-stack: row stylesheet');

      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-font-stack: settings row copy');
      const t = ctx.locale.bind(LOCALE_NS);

      ctx.slots.inject('settings.general.item', () => registerRow(ctx, t));
    }

    /**
     * Register the row. The registered component closes over the bound translate
     * function, so it needs no props: `settings.general.item` owners pass none.
     * @param ctx - the Client plugin context.
     * @param t - the plugin's bound translator.
     * @returns the disposer registration chain for `ctx.slots.inject`.
     */
    function registerRow(ctx, t) {
      const Row = () => h(FontRow, { t });
      return ctx.slots.register(
        {
          name: 'settings.general.item',
          id: 'font-stack',
          order: ROW_ORDER,
          label: () => t('row.title'),
        },
        Row,
      );
    }

    return { inject, apply };
  },
});
