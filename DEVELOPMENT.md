# BAT CLI 开发与本地测试指南 (DEVELOPMENT.md)

本文件记录 `bat-cli` 仓库内的目录结构、npm 脚本、开发脚本及 CLI 调试命令，供日常开发与维护参考。

---

## 📁 目录说明

| 目录 / 文件                      | 用途                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/`                           | CLI 源码（`cli.ts`、`pack.ts`、`client.ts` 等）                         |
| `templates/`                     | **脚手架模板**：`init` / `init-site` 时复制到用户的 `./submits/<host>/` |
| `templates/submit.template.json` | 完整 bundle 格式参考（只读，CLI 不引用）                                |
| `samples/`                       | **完整提交样本**：供自动化测试与远程推送共用                            |
| `tests/`                         | 测试代码（`*.test.ts`），不含样本数据                                   |
| `scripts/push-samples.ts`        | 将 `samples/` 批量提交到 dev / prod API                                 |
| `scripts/prepare-package.ts`     | 构建 npm 发布包到 `./pkg/`                                              |
| `submits/`                       | 本地开发时手动维护的提交目录（可选，不入 npm 包）                       |

`templates/` 与 `samples/` 的分工：

- `templates/` = 空白表格（`init` 时复制）
- `samples/` = 填好的完整样本（`bun test` + `dev:push-samples` / `prod:push-samples`）

当前 `samples/` 包含：`imagetostl.me`、`www.codebuddy.ai`。

---

## 📦 npm 脚本一览

在仓库根目录执行：

| 命令                        | 说明                                                     |
| --------------------------- | -------------------------------------------------------- |
| `bun install`               | 安装依赖                                                 |
| `bun run dev [子命令...]`   | 以 dev API 运行 CLI 源码（见下文）                       |
| `bun run build`             | 编译 CLI 到 `dist/`                                      |
| `bun run typecheck`         | TypeScript 类型检查                                      |
| `bun run test`              | 运行全量测试（离线，含 E2E）                             |
| `bun run dev:push-samples`  | 将 `samples/` 推送到 **dev** API                         |
| `bun run prod:push-samples` | 将 `samples/` 推送到 **prod** API（需 `--confirm-prod`） |
| `bun run prepare:pkg`       | 生成 npm 发布目录 `./pkg/`                               |
| `bun run build:pkg`         | `build` + `prepare:pkg`                                  |
| `bun run release`           | 发布新版本到 npm（release-it）                           |

### API 环境对照

| 环境 | API 地址                         | 如何指定                                                   |
| ---- | -------------------------------- | ---------------------------------------------------------- |
| dev  | `https://api-dev.bataitools.com` | `bun run dev ...`（自动注入 `--dev`）或 `dev:push-samples` |
| prod | `https://api.bataitools.com`     | 默认；`prod:push-samples` 或 `BAT_API_URL` 环境变量        |

本地凭据保存在 `~/.bat-cli/credentials.json`。**已登录时不会覆盖凭据**；换账号须先 `logout`。`push-samples` 与 `submit` 等命令会复用现有登录状态；无凭据时才会自动 guest 登录。

---

## 🚀 push-samples：推送 samples 到远程 API

脚本：`scripts/push-samples.ts`

用途：把 `samples/` 下含 `base.json` 的子目录，走完整 submit 流程（上传资源 → 打包 → 校验 → 提交），用于验证 dev / prod 环境的 API 与审核链路是否正常。

### 基本用法

```bash
# 推送全部 samples 到 dev（默认场景）
bun run dev:push-samples

# 只校验打包，不登录、不提交
bun run dev:push-samples -- --dry-run

# 只推送指定样本（目录名，即域名）
bun run dev:push-samples -- --only imagetostl.me
bun run dev:push-samples -- --only imagetostl.me,www.codebuddy.ai

# 推送到 prod（必须显式确认，会向生产 API 提交真实数据）
bun run prod:push-samples -- --confirm-prod
bun run prod:push-samples -- --confirm-prod --only imagetostl.me
```

### 参数说明

| 参数              | 说明                                                 |
| ----------------- | ---------------------------------------------------- |
| `--env dev\|prod` | 目标环境（npm script 已内置，一般无需手动传）        |
| `--dry-run`       | 仅本地打包 + 校验，不登录、不提交                    |
| `--only <name>`   | 只处理指定样本，逗号分隔，值为 `samples/` 下的目录名 |
| `--confirm-prod`  | 推 prod 时**必须**携带，否则拒绝执行                 |

### 典型工作流

```bash
# 1. 改完校验逻辑或 samples 数据后，先 dry-run
bun run dev:push-samples -- --dry-run

# 2. 确认无误后推到 dev 验证
bun run dev:push-samples

# 3. dev 通过后，必要时推到 prod
bun run prod:push-samples -- --confirm-prod
```

日志前缀为 `[push-samples]`，成功时会输出 `submitId`、`previewUrl` 等。

---

## 📤 prepare-package：构建 npm 发布包

脚本：`scripts/prepare-package.ts`

用途：在 `./pkg/` 生成可发布到 npm 的干净包（剥离 devDependencies、scripts，拷贝 `dist/` 与 `templates/`）。

```bash
# 仅生成 pkg/
bun run prepare:pkg

# 先编译再生成（发布前推荐）
bun run build:pkg
```

生成结果：

```
pkg/
├── dist/          # 编译后的 CLI
├── templates/     # init 脚手架（随 npm 包分发）
├── package.json     # 精简后的 manifest
├── README.md
└── LICENSE
```

注意：`samples/`、`tests/`、`scripts/` **不会**打入 npm 包，仅仓库内开发使用。

---

## 🛠️ CLI 本地调试（`bun run dev`）

无需编译，直接运行 TS 源码。`bun run dev` 会自动指向 dev API（等价于源码里的 `--dev` 标志）。

```bash
bun run dev --help
```

### 登录与凭据

凭据文件：`~/.bat-cli/credentials.json`

**规则：已登录时，`login` / `login guest` 不会覆盖现有凭据，必须先退出。**

```bash
# 正式账号（OAuth 或 API Key，dev 环境）
bun run dev login --env dev
bun run dev login --key bat_xxx --env dev

# Guest 匿名账号（仅在没有登录时可用）
bun run dev login guest

# 退出（删除本地凭据，之后才能重新 login）
bun run dev logout
```

换环境（dev ↔ prod）时：先 `logout`，再 `login --env dev|prod`。

`submit`、`pack`、`dev:push-samples` 等命令通过 `ensureToken()` **复用**当前凭据；若无凭据才会自动 guest 登录。

### 初始化提交目录（使用 templates/）

```bash
# 在指定路径创建 base.json + i18n/en.json（来自 templates/submit/）
bun run dev init ./submits/my-site-dir

# 按域名在 ./submits/<host>/ 下初始化
bun run dev init-site --website https://example.com --root ./submits

# 查询域名对应的目录路径
bun run dev site-dir https://example.com --root ./submits
```

### 校验与打包

```bash
# 一阶段：仅校验 base.json + i18n/en.json
bun run dev validate-phase1 ./submits/example.com

# 生成多语言翻译占位模板
bun run dev translate-template ./submits/example.com --from en --to zh,tw,ja

# 打包目录为 bundle（含资源上传）
bun run dev pack ./submits/example.com -o ./submits/example.com/submit.bundle.json

# 二阶段：校验完整 bundle
bun run dev validate -f ./submits/example.com/submit.bundle.json
```

### 提交与查询

```bash
# 一键：上传资源 → 打包 → 校验 → 提交到 dev API
bun run dev submit --dir ./submits/example.com

# 查询审核状态
bun run dev status --id <submitId>
bun run dev list --format table
```

### 资源抓取

```bash
bat-cli fetch-logo --url <logo-url> --dir <submit-dir>
bat-cli capture-screenshot --website <url> --dir <submit-dir>
# 首次使用 Playwright 需：bunx playwright install chromium
```

---

## 🧪 自动化测试

```bash
bun test
bun run typecheck   # 提交前建议执行
```

### 测试文件

| 文件                       | 内容                                                      |
| -------------------------- | --------------------------------------------------------- |
| `tests/validation.test.ts` | 打包、Phase 1 / Phase 2 校验、边界用例                    |
| `tests/e2e.test.ts`        | CLI 子进程 E2E；本地 Mock API（6665 端口）；HOME 沙箱隔离 |

E2E 测试**不访问真实网络**，API 响应由测试内 `Bun.serve` 模拟。

---

## 🔄 添加或切换 samples 样本

### 步骤 1：放入样本目录

在 `samples/` 下按域名创建目录：

```
samples/mytest.com/
├── base.json
└── i18n/
    ├── en.json
    └── ...（其他语言）
```

添加后，`dev:push-samples` 会自动扫描（含 `base.json` 的子目录）；无需改脚本。

### 步骤 2：（可选）切换测试断言

若需让 `bun test` 针对新样本断言，修改 `tests/validation.test.ts` 与 `tests/e2e.test.ts` 顶部常量：

```typescript
const TEST_DOMAIN = 'mytest.com';
const SAMPLE_DIR = resolve(import.meta.dirname, `../samples/${TEST_DOMAIN}`);
const EXPECTED_WEBSITE = 'https://mytest.com';
const EXPECTED_LOGO = 'https://...';
```

然后执行 `bun test` 验证。

---

## 🚨 代码规范

提交前须通过 Prettier（husky pre-commit）：

1. **缩进**：Tab，`tabWidth = 4`
2. **引号**：单引号 `'`
3. **分号**：保留
4. **凭据**：禁止将真实 API Key 提交到仓库；E2E 测试已通过 HOME 沙箱隔离本地凭据
