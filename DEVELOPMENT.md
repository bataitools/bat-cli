# BAT CLI 开发与本地测试指南 (DEVELOPMENT.md)

本文件详细记录了 `bat-cli` 的本地开发流程、代码规范以及如何在开发环境中运行和扩展自动化测试，以便您或后续开发者在未来的迭代中能够快速上手。

---

## 🛠️ 本地环境准备与开发命令

### 1. 安装依赖

项目采用 [Bun](https://bun.sh/) 作为包管理与测试执行工具：

```bash
bun install
```

### 2. 本地调试运行

无需编译，直接在本地运行 TS 源码进行调试：

```bash
bun run dev [commands...]
# 例如：
bun run dev --help
bun run dev site-dir https://example.com
```

### 3. 类型检查

由于使用了 TypeScript，修改任何源码后，在提交流程前均需执行类型检查确保没有类型安全问题：

```bash
bun run typecheck
```

### 4. 常用 CLI 调试命令示例

在开发迭代中，可使用 `bun run dev` 替代全局安装的 `bat-cli` 来模拟执行与调试具体的命令行分支：

- **Guest 匿名账号快捷登录（在本地生成 credentials.json）**：

    ```bash
    bun run dev login-guest
    ```

- **静态初始化脚手架（于指定路径创建 base.json 及 en.json 模板）**：

    ```bash
    bun run dev init ./submits/my-site-dir
    ```

- **按照域名与指定的 root 目录初始化脚手架**：

    ```bash
    bun run dev init-site --website https://example.com --root ./submits
    ```

- **查询指定域名在提交根目录下的相对解析路径**：

    ```bash
    bun run dev site-dir https://example.com --root ./submits
    ```

- **对指定的产品提交目录运行一阶段静态文件校验（Phase 1）**：

    ```bash
    bun run dev validate-phase1 ./submits/example.com
    ```

- **根据英文原件，自动生成或增量更新多语言翻译模板占位符**：

    ```bash
    bun run dev translate-template ./submits/example.com --from en --to zh,tw,ja
    ```

- **本地打包产品目录（将 base.json 与翻译后的 json 文件压缩合成最终的 bundle.json）**：

    ```bash
    bun run dev pack ./submits/example.com -o ./submits/example.com/submit.bundle.json
    ```

- **对已打包的 bundle.json 进行本地二阶段格式与逻辑完整校验**：

    ```bash
    bun run dev validate -f ./submits/example.com/submit.bundle.json
    ```

- **打包当前产品目录并自动上传资源、校验并执行服务端提交发布（一键流）**：

    ```bash
    bun run dev submit --dir ./submits/example.com
    ```

- **查询产品提交的审核状态与进度**：

    ```bash
    bun run dev status --id <submitId>
    ```

- **列出当前用户的所有产品提交记录**：
    ```bash
    bun run dev list --format table
    ```

---

## 🧪 自动化测试架构与执行

我们使用 Bun 自带的测试框架 `bun test`。测试用例在设计上完全自包含，**100% 离线、快速且不依赖外部网络**。

### 1. 执行测试

运行全量测试套件（包括单元测试与端到端测试）：

```bash
bun test
```

### 2. 测试目录与功能划分 (`tests/`)

测试代码被按功能拆分在以下文件中：

- **[validation.test.ts](file:///Users/jeff/Projects/bat/bat-cli/tests/validation.test.ts)** (打包与校验单元测试)
    - 针对内存里的静态打包（`packSubmitDirectory`）、一阶段校验（`validatePhase1Directory`）及完整 Bundle 校验逻辑进行分支断言。
- **[e2e.test.ts](file:///Users/jeff/Projects/bat/bat-cli/tests/e2e.test.ts)** (命令行端到端集成测试)
    - 采用**非阻塞异步子进程**（`Bun.spawn`）拉起 CLI 源码。
    - **沙箱隔离**：测试执行时会将 `HOME` 重定向为系统临时沙箱目录，彻底防止测试读写污染您本地真实的 `~/.bat-cli/credentials.json` 凭据。
    - **Mock API 服务**：在 `beforeAll` 中拉起一个本地 `Bun.serve` HTTP 服务器（6665 端口）拦截并模拟 `auto-login`、`submit`、`list`、`schema` 等接口的网络响应。
- **[mock/](file:///Users/jeff/Projects/bat/bat-cli/tests/mock)** (测试样本数据集)
    - 存放用于测试打包的本地样本，当前包含 `imagetostl.me` 样本目录。

---

## 🔄 如何切换或添加自定义测试数据集

如果您在开发中遇到了复杂的边界场景，想要用别的数据源在本地进行校验测试，按以下步骤操作即可：

### 步骤 1：放入测试数据

在 `tests/mock/` 目录下创建一个与您的域名同名的文件夹（如 `tests/mock/mytest.com`），并将配置结构放进去：

- `tests/mock/mytest.com/base.json`
- `tests/mock/mytest.com/i18n/en.json` (以及其他语言)

### 步骤 2：更改测试常量

打开 [validation.test.ts](file:///Users/jeff/Projects/bat/bat-cli/tests/validation.test.ts) 和 [e2e.test.ts](file:///Users/jeff/Projects/bat/bat-cli/tests/e2e.test.ts)，在文件最上方修改配置常量：

```typescript
// 修改为你的域名
const TEST_DOMAIN = 'mytest.com';
const TEST_MOCK_DIR = resolve(import.meta.dirname, `./mock/${TEST_DOMAIN}`);

// 修改为你期望的断言匹配结果
const EXPECTED_WEBSITE = 'https://mytest.com';
const EXPECTED_LOGO = 'https://example.com/logo.webp';
```

修改完成后，再次执行 `bun test` 即可快速检验该特定数据在打包和完整提交流程中的校验表现。

---

## 🚨 团队协作代码规范与约束

在修改项目源码时，必须严格遵守以下代码格式规范（否则在 `git commit` 时会被 `prettier` 拦截提交）：

1. **缩进格式**：统一使用 **Tab** 缩进，`tabWidth` 设为 `4`。
2. **单双引号**：统一使用 **单引号** `'`。
3. **分号结尾**：语句末尾统一**保留分号** `;`。
4. **凭据安全**：禁止直接提交个人的真实邮箱及 API Key 至代码库中，本地沙箱测试已经通过代码进行了隔离。
