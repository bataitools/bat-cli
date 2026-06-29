#!/bin/bash

# ==============================================================================
# 脚本名称: clean-link.sh
# 脚本用途: 本地开发调试时，清理系统中残留的旧版 bat-cli，并重新将本地最新源码编译且链接到全局。
#
# 解决痛点:
#   1. 当修改了 src/ 中的 TS 源码，而没有重新执行 build 时，全局执行的 bat-cli (bin 指向 dist/cli.js)
#      依然运行的是历史编译产物，导致如接口签名错误等 Bug 修改不生效。
#   2. 本地通过 npm install -g 安装的包与开发环境的本地软链接可能产生冲突或覆盖残留。
#
# 核心步骤:
#   1. 卸载并断开全局现存的 @bataitools/bat-cli 软链接（无论是 npm 全局包、NPM Link 还是 Bun Link 软链）。
#   2. 清理常见 PATH 路径下的全局二进制软链接（如 /usr/local/bin 和 ~/.bun/bin 中的 bat-cli 残留）。
#   3. 安装本地最新依赖，并运行编译构建出最新的编译产物 (dist/cli.js)。
#   4. 执行 npm link 将当前工作目录挂载为全局命令，使终端中任意位置调用的 bat-cli 均指向此本地最新编译版。
# ==============================================================================

# 确保在出错时立刻退出
set -e

# 定位脚本所在目录，并进入 bat-cli 项目根目录
SRC_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$SRC_DIR"

echo "=== 1. 开始清理本地可能残留的旧版本 bat-cli ==="

# 1. 清理 npm 全局安装或软链接链接的包
echo "[NPM] 尝试卸载和取消链接全局 @bataitools/bat-cli (无论是否存在)..."
npm uninstall -g @bataitools/bat-cli || true
npm unlink -g @bataitools/bat-cli 2>/dev/null || true

# 2. 清理全局软链接
if [ -L "/usr/local/bin/bat-cli" ]; then
    echo "[Link] 清除 /usr/local/bin/bat-cli 软链接..."
    rm -f "/usr/local/bin/bat-cli"
fi

# 3. 清理 bun 全局 bin 目录中的残留
BUN_BIN_PATH="$HOME/.bun/bin/bat-cli"
if [ -f "$BUN_BIN_PATH" ] || [ -L "$BUN_BIN_PATH" ]; then
    echo "[Bun] 发现 Bun 全局 bin 路径下有 bat-cli，正在清除..."
    rm -f "$BUN_BIN_PATH"
fi

echo "=== 2. 开始在当前仓库构建并重新建立软链接 ==="

# 4. 安装依赖并执行编译
echo "[Build] 安装依赖并重新构建最新代码..."
bun install
bun run build

# 5. 使用 npm 重新链接当前目录到全局
echo "[Link] 重新将本地最新编译的版本链接到全局 (npm link)..."
npm link

echo "=== 3. 验证当前生效 of bat-cli 版本与路径 ==="
CURRENT_PATH=$(which bat-cli || echo "未找到")
echo "当前执行路径: $CURRENT_PATH"

if [ "$CURRENT_PATH" != "未找到" ]; then
    echo "当前版本信息:"
    bat-cli --version || true
    echo "✅ 全局 bat-cli 已成功指向本地最新修改的代码！"
else
    echo "❌ 警告：未在 PATH 中找到 bat-cli。请确保系统的全局 node/bin 目录在 PATH 环境变量中。"
fi
