# Bat CLI - Guidelines & Dev Commands (CLAUDE.md)

> [!IMPORTANT]
> **开发指南与自包含核心准则**
> 本文件是 `bat-cli` 专属的 AI 编码助手核心准则。
> `bat-cli` 是一个**完全独立、自包含的 GitHub 开源项目**，其配置与开发流程不能依赖外层 Monorepo 的其他任何文件。所有改动必须确保该项目在独立 Clone 时可开箱即用。

---

## 🗺️ 业务地图与职责定位 (Business & Architecture Map)

`bat-cli` 是 **BAT AI TOOLS（bataitools.com）** 的官方命令行客户端，核心职责是帮助开发者**在本地校验、打包、授权并提交其 AI Agent / Skill 产品**到平台进行多语言发布。

### 1. 核心架构与模块职责

- **`src/cli.ts` (核心入口)**：解析命令行参数（`login`, `submit`, `publish` 等指令）并路由到对应逻辑。
- **`src/config.ts` (配置存储)**：读写本地凭证（`~/.bat-cli/credentials.json`），自动处理设备级临时 Guest 账号静默登录与 API 地址切换。
- **`src/login-flow.ts` (授权认证)**：实现 OAuth 2.0 Device Authorization Flow。在终端展示授权码，并自动在浏览器中唤起授权页面，完成无缝设备绑定。
- **`src/pack.ts` (本地打包)**：在本地对产品目录进行第一阶段静态分析，校验目录结构（`manifest.json`）并压缩打包为 `.bundle.json`。
- **`src/shared/` (共享校验规则)**：保存客户端与服务端通用的核心校验逻辑（如多语言数据检查、提交结构约束等）。**注意：此处文件自包含，不从外层 packages 引入任何共享代码**。
- **`src/client.ts` (API 交互)**：封装对平台 API 的 HTTP 请求（获取 Schema、提交验证、执行最终发布等）。

### 2. 依赖的 API 基址

- 生产环境默认 API：`https://api.bataitools.com`
- 开发环境可通过 `BAT_API_URL` 环境变量或 `credentials.json` 覆盖。

---

## 💻 常用开发与发布指令 (Dev & Build Commands)

### 1. 本地开发与构建

- **安装依赖**：
    ```bash
    bun install
    ```
- **本地直接调试**：
    ```bash
    bun run dev [commands...]
    # 例如：bun run dev --help
    ```
- **编译打包**（输出至 `./dist/cli.js`）：
    ```bash
    bun run build
    ```
- **运行 TS 类型检查**（修改任何 TS 代码后必须运行此命令）：
    ```bash
    bun run typecheck
    ```

### 2. 版本发布与 OIDC 自动发包 (Release & OIDC Publish)

- **版本提升与生成 Changelog** (基于 `release-it`)：
    ```bash
    bun run release
    ```
- **本地构建与打包校验 (Dry Run)**：
    ```bash
    bun run build:pkg
    cd pkg && npm pack --dry-run
    ```
- **自动化发布 (GitHub Actions + OIDC / Trusted Publisher)**：
  推送 `v*` 前缀的 Git Tag 会自动触发 GitHub Actions 中的 `publish.yml` 工作流。该工作流 100% 托管于 OIDC 免密校验流程，在 `pkg/` 目录下原生调用 `npm publish --provenance` 完成包的安全发布。**本项目已废除本地手动发包机制，以消除认证降级隐患。**

---

## 🚨 代码规范与提交约束 (Code Style & Git Hooks)

1. **代码风格 (Code Style)**：
    - **缩进**：统一使用 **Tab** 缩进，`tabWidth` 为 4。
    - **引号**：统一使用 **单引号** `'`。
    - **分号**：语句末尾统一**保留分号** `;`。
    - 所有的代码格式化均由项目根目录的 `.prettierrc` 强制执行。
2. **提交前自动格式化 (Pre-commit Hook)**：
    - 本项目配置了独立的 `husky` 与 `lint-staged`。
    - 在执行 `git commit` 时，会自动拦截并对暂存区内的文件（`.ts`, `.json`, `.md` 等）运行 `prettier --write`。
3. **本地身份绑定**：
    - 本地开发身份已通过项目的 `.gitconfig` 统一建议为 `webeasymail`。可通过运行 `git config include.path "../.gitconfig"` 并在 `.gitconfig` 中配置你的邮箱来进行身份绑定，**禁止直接提交个人真实邮箱到代码库中**。

---

## 📋 AI 自我强制审查清单 (Checklist)

在生成代码或提供最终方案时，在 `thought` 块中**强制自我对照**以下问题：

1. [ ] **自包含完整性**：我的修改是否依赖了 `bat-cli` 目录外的任何共享文件（如根项目的 `packages/`）？（如果是，必须杜绝，所有通用校验和类型必须在 `bat-cli/src/shared` 内独立定义）。
2. [ ] **编译检查自愈**：我修改代码后是否在 `bat-cli` 下成功运行了 `bun run typecheck`？是否存在任何 Lint 或 TS 编译报错？
3. [ ] **格式化检测**：我的修改是否完全遵循 Tab 缩进、单引号和保留分号的原则？
4. [ ] **命令可用性**：新加入的功能是否有对应的命令行参数或子命令引导，其报错是否能友好输出在终端？
5. [ ] **语言限制**：我的输出与思考是否全过程使用简体中文？
