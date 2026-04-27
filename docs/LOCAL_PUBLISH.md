# 本地发包到 npm 流程（macOS ARM64）

把 `npx-cli/` 作为独立 npm 包从本地机器直接发布（例如 `kanban18`）。**不走 GitHub Actions / R2**。

---

## TL;DR

一次性准备好环境后，后续每次发版只需要这 4 步：

```bash
# 1. 改版本
cd npx-cli && npm version patch --no-git-tag-version && cd ..

# 2. 构建（前端 + Rust 二进制 + zip 到 npx-cli/dist/）
pnpm run build:npx

# 3. 预览
cd npx-cli && npm pack --dry-run

# 4. 发布
npm publish --access public
```

> 或者直接跑 [`scripts/local-publish.sh`](#一键脚本)，自动处理全部检查。

---

## 它是怎么工作的

- 根 `package.json` 是 `"private": true`，**不发**。
- 真正发出去的是 `npx-cli/`，内容很薄：`bin/cli.js` + `bin/download.js` + `dist/<platform>/*.zip`。
- Rust 后端 + 前端静态资源 → 编译成单一 `server` 二进制（前端通过 `rust_embed` 内嵌）→ zip 到 `npx-cli/dist/<platform>/vibe-kanban.zip`。
- 用户 `npx kanban18` 时，`bin/cli.js` 按平台找 zip → 解压 → 运行。

### `bin/download.js` 的两种模式

| 模式 | 触发 | 行为 |
|---|---|---|
| **LOCAL_DEV_MODE** | `npx-cli/dist/` 存在 | 直接用包里自带的 zip，不联网 |
| 远程下载 | 否则 | 从 R2 拉，需要 `__R2_PUBLIC_URL__` 占位符被替换 |

**本地发包走 LOCAL_DEV_MODE**：把 zip 打进 tgz，用户装完就能跑，不依赖任何外部服务。

### 限制

本地只能构建当前机器的平台。**Mac ARM64 发出去的包只在 Mac ARM64 上能用**。要支持多平台请走 CI（`.github/workflows/pre-release.yml`）。

---

## 一次性环境准备

逐项过一遍，全部 ✅ 再进入发包流程。

### ① 工具链

```bash
# Rust nightly（与 rust-toolchain.toml 对齐）
rustup toolchain install nightly

# Node >= 18、pnpm >= 8（看根 package.json engines）
node -v && pnpm -v
```

### ② 根项目依赖

```bash
pnpm install
```

### ③ `npx-cli` 依赖（⚠️ 容易漏）

`npx-cli` **不在 `pnpm-workspace.yaml`** 里（workspace 只有 `frontend` 和 `remote-frontend`），根目录的 `pnpm install` 不会装它的依赖。否则本地跑 CLI 会报 `Cannot find module 'adm-zip'`。

```bash
cd npx-cli && npm install && cd ..
```

> 发包不用管 `node_modules`——`files` 只打包 `bin` 和 `dist`，`adm-zip` 在 `dependencies` 声明，用户 `npx` 时 npm 自动装。

### ④ npm registry 必须是官方源

国内常见坑：registry 被设成了淘宝镜像（只读，不能 publish，会报 `ENEEDAUTH ... npmmirror`）。

```bash
npm config get registry
# 必须是 https://registry.npmjs.org/
# 如果不是：
npm config set registry https://registry.npmjs.org/
```

### ⑤ npm 登录 + 处理 2FA

```bash
npm login       # 切过 registry 后必须重新 login
npm whoami      # 返回你的用户名即 OK
```

**如果账号开了 publish 级 2FA**，每次 publish 都需要 OTP。推荐一次性配置 **Granular Access Token + Bypass 2FA**，以后直接 publish 不用输验证码：

1. https://www.npmjs.com/settings/\<你的用户名\>/tokens → **Generate New Token** → **Granular Access Token**
2. 关键配置：
   - Permissions: **Read and write**
   - Select packages: `kanban18`（或 All）
   - **Bypass 2FA for publishing**: ✅ **必须勾选**（页面要往下拉）
3. 生成后**立刻复制**（只显示一次），**不要在终端明文粘贴**（会进 shell history），推荐：

```bash
# 用 -s 读入，不回显
read -s NPM_TOKEN
# 粘贴 token 后回车
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
unset NPM_TOKEN
```

验证：

```bash
npm whoami   # 仍然返回用户名，但已无需 OTP
```

> ⚠️ 如果 token 不小心泄漏（粘贴到终端、commit 到 git），立即到 npm 后台 **Revoke** 重新生成。

### ⑥ 确认包名可用 & 修 repository URL

```bash
npm view kanban18          # 报 404 表示可用
```

`npx-cli/package.json` 检查两个字段：

```json
{
  "name": "kanban18",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SolomonFang/vibe-kanban.git"
  },
  "files": ["bin", "dist/**/*.zip"]
}
```

- `repository.url` 前面必须有 `git+`，否则 `npm publish` 会警告并自动改。
- `files` **务必**写成 `dist/**/*.zip`，只打包 zip，避免冒烟测试解压出来的大二进制混进 tgz（能从 200MB 降到 55MB）。

---

## 发包流程（每次发版）

### Step 1 · 改版本号

```bash
cd npx-cli
npm version patch --no-git-tag-version    # 0.1.8 → 0.1.9
# 或 minor / major / 指定：npm version 0.2.0 --no-git-tag-version
cd ..
```

### Step 2 · 构建

```bash
pnpm run build:npx
```

等价于 `bash ./local-build.sh`，它会：

1. 探测当前平台 → `macos-arm64`
2. `cd frontend && npm run build` → `frontend/dist/`
3. `cargo build --release` 编译三个 bin（前端被 `rust_embed` 内嵌进 `server`）
4. 清 `npx-cli/dist/` → zip 到 `npx-cli/dist/macos-arm64/`

> 前端代码未变时，**构建是可缓存的**（cargo 增量编译 + vite 缓存），重跑很快。

验证产物：

```bash
ls -lh npx-cli/dist/*/
# vibe-kanban.zip         ~45MB
# vibe-kanban-mcp.zip     ~5MB
# vibe-kanban-review.zip  ~4MB
```

### Step 3 · （可选）本地冒烟测试

```bash
cd npx-cli
node bin/cli.js
# 预期：Starting vibe-kanban v0.1.9 (local dev)...
# 后端启动、浏览器打开 UI，Ctrl+C 退出
```

> ⚠️ 冒烟会把 zip 解压到 `dist/<platform>/` 里（LOCAL_DEV_MODE 的缓存目录就是 dist 本身）。**但因为 `files: ["bin", "dist/**/*.zip"]` 只匹配 zip，解压残留不会被发出去**，可以放心。

如需清干净：

```bash
find npx-cli/dist -type f ! -name '*.zip' -delete
```

### Step 4 · 打包预览

```bash
cd npx-cli
npm pack --dry-run
```

检查清单，**必须**是这 7 个文件：

```
bin/cli.js
bin/download.js
dist/macos-arm64/vibe-kanban.zip
dist/macos-arm64/vibe-kanban-mcp.zip
dist/macos-arm64/vibe-kanban-review.zip
package.json
README.md
```

总包大小应在 **50-60MB** 之间，超过 100MB 说明 `files` 配错了或残留没清。

### Step 5 · 发布

```bash
npm config get registry        # 最后一次确认是官方源
npm publish --access public
```

### Step 6 · 验证

```bash
# 查 registry 是否已收录
npm view kanban18 version

# 清 npx 缓存后远程装一遍
rm -rf ~/.npm/_npx
npx kanban18@latest
```

---

## 一键脚本

保存为 `scripts/local-publish.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/6] 检查 npm registry..."
REGISTRY=$(npm config get registry)
if [[ "$REGISTRY" != "https://registry.npmjs.org/" ]]; then
  echo "   当前: $REGISTRY"
  echo "   ❌ 必须用官方源。修复: npm config set registry https://registry.npmjs.org/ && npm login"
  exit 1
fi

echo "==> [2/6] 检查 npm 登录..."
npm whoami >/dev/null || { echo "   ❌ 未登录，先 npm login"; exit 1; }

echo "==> [3/6] 确保 npx-cli 依赖已装..."
[ -d npx-cli/node_modules ] || (cd npx-cli && npm install --silent)

echo "==> [4/6] 构建前端 + Rust 二进制..."
pnpm run build:npx

echo "==> [5/6] 清理 dist 非 zip 残留（保险）..."
find npx-cli/dist -type f ! -name '*.zip' -delete

echo "==> 预览打包内容..."
cd npx-cli
npm pack --dry-run

read -rp "继续发布? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "已取消。"; exit 0; }

echo "==> [6/6] 发布..."
npm publish --access public

PKG=$(node -p "require('./package.json').name")
VER=$(node -p "require('./package.json').version")
echo ""
echo "✅ 已发布 $PKG@$VER"
echo "   验证: npx $PKG@latest"
```

使用：

```bash
chmod +x scripts/local-publish.sh
./scripts/local-publish.sh
```

---

## 常见问题速查

| 报错 | 原因 | 解决 |
|---|---|---|
| `Cannot find module 'adm-zip'` | `npx-cli` 不在 workspace | `cd npx-cli && npm install` |
| `ENEEDAUTH ... npmmirror.com` | registry 是淘宝镜像 | `npm config set registry https://registry.npmjs.org/` + 重新 login |
| `403 Two-factor authentication ... required` | 开了 publish 级 2FA | 用 Granular Token + Bypass 2FA（见准备 ⑤）；或临时 `--otp=123456` |
| tgz 超过 100MB | 冒烟测试产生的二进制残留被打包 | 改 `files: ["bin", "dist/**/*.zip"]` |
| `extracted binary not found` | zip 里二进制名不对 | 检查 `local-build.sh` 里的重命名（必须叫 `vibe-kanban` 不是 `server`） |
| 其它平台用户装了跑不起来 | 本地包只有本机平台二进制 | 预期行为。要多平台走 CI |
| `repository.url was normalized to git+...` | URL 缺 `git+` 前缀 | 在 package.json 里改成 `git+https://...` |
| 发错版本想撤回 | - | 72h 内 `npm unpublish kanban18@X.Y.Z`；推荐 `npm deprecate kanban18@X.Y.Z "原因"` |

---

## 关键文件

- 构建脚本：`local-build.sh`
- CLI 入口：`npx-cli/bin/cli.js`
- 下载逻辑：`npx-cli/bin/download.js`
- 包配置：`npx-cli/package.json`
- 前端内嵌点：`crates/server/src/routes/frontend.rs`（`rust_embed` 引用 `../../frontend/dist`）
- 官方多平台 CI（参考）：`.github/workflows/pre-release.yml` + `publish.yml`
