# dsh-font-stack

给 DeepSeek Harness 自定义字体的插件：在设置里输入**任意标准 CSS 字体栈**，覆盖整个界面与代码块的字体。[Web 端](http://127.0.0.1:19387) 与桌面端同时生效。

- 仓库：<https://github.com/vanvanhasnophi/dsh-custom-font>
- npm 包名：`dsh-font-stack`（npm 上 `dsh-custom-font` 已被同名的另一个插件占用，故包名与仓库名不同）

## 功能

- **界面字体栈**：覆盖 UI 正文字体（导航、侧边栏、会话内容、设置页）。
- **等宽字体栈**：覆盖代码块与行内代码的字体。
- 4 个快速预设（系统默认 / Inter / 中文优先 / 衬线），以及「恢复默认」。
- 实时预览：输入时立刻看到两种字体的真实效果。
- 即时生效：改完无需刷新页面，当前窗口立即换字。
- 中英文界面文案随 Harness 当前语言切换。

## 使用

1. 打开 **设置 → 通用**，找到最下方的「字体」一行（在「外观」和「字号大小」之后）。
2. 勾选 **启用自定义字体**。
3. 在 **界面字体栈** 和 **等宽字体栈** 两个输入框里填入 CSS 字体栈，例如：

   ```
   Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
   '"JetBrains Mono", "Cascadia Code", Consolas, monospace'
   ```

   字段就是 CSS `font-family` 的值，直接照 CSS 语法写即可（带空格的字体名请用引号）。
4. 想要一键套用，点预设按钮，或点「恢复默认」清空自定义。

## 覆盖了哪些 CSS 变量

Harness 的主题表把字体集中在一组自定义属性上，本插件覆盖其中三个，因此覆盖面完整而侵入面最小：

| 变量 | 作用 |
| --- | --- |
| `--dsw-font-family` | 界面正文；`body` 通过 `var(--dsw-font-family, …)` 继承它，Markdown 标题的 `font:` 简写也由它兜底 |
| `--ds-font-family-code` | 代码块与行内代码 |
| `--dsw-font-markdown-code-font-family` | Markdown 代码族的字体变量 |

覆盖声明写在 `html` 上并带 `!important`：官方基础表把这三项声明在 `:root`，`html` 的特异性高于 `:root`，因此用户值必然取胜，不依赖样式表加载顺序。

**刻意不覆盖**：KaTeX 数学字体（`.katex` 自带的 `font-family` 没有 `!important`，对后代强加字体会破坏公式排版）、终端（`@deepseek-ai/dsh-client-ui-sidebar-terminal` 给 xterm 写死了 `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` 与固定 `fontSize: 13`，不读任何 CSS 变量），以及代码高亮 token 的颜色。等宽字体栈只影响 Markdown 与工具卡片里的代码。设置行里的「强制覆盖组件字体」开关会把界面字体栈以 `!important` 直接写到 `html, body`，仅在所选字体不生效时使用——它同样刻意不波及 `.katex`。

## 安装

这是一个标准的 DSH bundle：`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 把 `dsh-font-stack` 一行插进 profile 的插件名册，Client 半边由 `dsh.client` 描述。它**没有任何运行时依赖**，所以从 npm、GitHub 还是本地目录装都一样。

**从 GitHub 装**（`install_bundle` 接受 git 地址）：

```
plugin_manager install_bundle github:vanvanhasnophi/dsh-custom-font
```

**从 npm 装**（发布后）：

```
plugin_manager install_bundle dsh-font-stack
```

**从本地目录装**（开发时）：

```
plugin_manager install_bundle C:\path\to\dsh-custom-font
```

> 安装目标 profile 无法指定：`plugin_manager` 只管理当前运行应用所属的 profile。要让**另一个** profile 也生效，需要单独装一次——把 `"dsh-font-stack": "link:<绝对路径>"`（或 npm / git 地址）加进该 profile 的 `package.json`，把 `dsh-font-stack` 追加到它的 `dsh.profile.bundles`，然后在该 profile 目录执行 `pnpm install`。

安装完成后需**重启应用**让新增的 Host 条目激活；此后的代码改动随页面刷新加载。

### 从源码开发

```powershell
git clone https://github.com/vanvanhasnophi/dsh-custom-font.git
cd dsh-custom-font
npm test
```

测试只用 Node 内置模块，**无需安装任何依赖**。

### 维护者：改仓库地址与发布

仓库地址写死在 `package.json` 的 `homepage` / `repository` / `bugs` 里，用脚本改，别手改 JSON：

```powershell
npm run set-repository                                   # 用脚本里的默认值
$env:DSH_FONT_STACK_REPO='owner/repo'; npm run set-repository
```

发布到 npm（包名 `dsh-font-stack`，需要先 `npm login`）：

```powershell
npm publish          # prepublishOnly 会先跑测试；publishConfig 指向 registry.npmjs.org 并开启 provenance
npm pack --dry-run   # 只看打包内容，不发布
```

## 结构

| 文件 | 作用 |
| --- | --- |
| `cordis.patch.yml` | bundle patch：把 `dsh-font-stack` 行插入 profile 的插件名册 |
| `src/host.js` | Host 半边：无副作用、无运行时依赖；持有 `buildFontCss` / `sanitizeFontStack` 的权威实现 |
| `src/client.js` | Client 半边：偏好读写、`<style>` 注入、设置页「字体」一行 |
| `test/font-css.check.mjs` | CSS 生成、字符净化、注入安全、清单约束，并逐字校验两半边实现一致 |
| `test/client-module.check.mjs` | 在 `vm` 沙箱里按 Harness 模块加载协议加载 Client 半边，跑 `apply`，校验 slot 注册形状、样式与 locale 副作用、组件树 |

运行：

```powershell
npm test
# 等价于：
node test/font-css.check.mjs
node test/client-module.check.mjs
```

## 设计取舍

- **Client 半边承担全部逻辑，Host 半边不持有状态**。这不是偷懒，而是被安装机制逼出来的：profile 通过 `link:` 指向本地目录安装时，pnpm **不会**解析该链接包自己的依赖（`pnpm-lock.yaml` 里只有 `version: link:…`，不产生包条目），所以任何在 Host 半边 `import` 第三方包的插件（例如导出 `Config` 所必需的 `schemastery`）装进 profile 后都会 `ERR_MODULE_NOT_FOUND`。Host 零依赖是「装到任何 profile 都能激活」的前提。
- **偏好存 `localStorage`**（键 `dsh-font-stack:prefs`）。存储被禁用或写满时降级为「本次会话有效」，不会让设置行报错。
- **字体栈先净化再拼进样式表**：去掉 `; : { } < > @`，换行压成一行。恶意或粘贴错乱的输入只能留下无害文本，无法闭合声明、另起规则或添加属性。
- **两半边实现逐字一致**：Client 半边无法 `import` 相对路径，只能自带一份；`test/font-css.check.mjs` 会逐字比对两处的 `sanitizeFontStack` / `buildFontCss`，任一处分歧都让测试失败。
- **不导入 Harness 的 Client UI 包**：设置行只用原生元素 + 主题 token 画，避免绑定未公开的内部结构。

## 已知限制

- **终端不跟随**：侧边栏终端的等宽字体在 Harness 里是写死的，插件无法在不改官方代码的前提下覆盖它。
- 首屏闪烁：Harness 官方字体变量在客户端启动时才注入，因此冷启动的首帧可能先用系统字体，随后切换。桌面端的独立欢迎窗口使用同一套变量，也会跟随本设置。
- 设置只作用于当前浏览器来源（`localStorage` 按 origin 隔离）；桌面窗口与浏览器标签各自保存自己的偏好。
- 未做字体可用性检测：填了系统里不存在的字体名时，浏览器会按字体栈继续回退到后面的候选或默认字体；此时可打开「强制覆盖组件字体」排查是否是组件自身字体规则导致的。
