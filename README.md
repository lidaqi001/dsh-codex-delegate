# Codex 委托模式（DSH Agent 预设 bundle）

把「所有处理都交给 codex 子代理」做成一个独立的 Agent 预设：主代理只负责理解请求、
拆分任务、委派与汇总，实际工作全部由 `subagent_codex` 派给 codex 子代理执行。

这是一个**纯声明式 bundle**（没有插件代码、无需编译），29 KB 以内，可以像普通 npm 包
一样打包、发布、按版本安装。

## 组成

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch` 指向下面的 patch；带 locale、icon 导出与 peer 依赖约束 |
| `cordis.patch.yml` | 真正的配置：插入 `preset-codex`（persona + 委派工具 + ask_user + todo + compaction） |
| `locale/en.json`、`locale/zh.json` | 插件面板里的标题/描述 |
| `icon.svg` | 插件面板图标 |
| `LICENSE` | MIT |

预设内容：persona（`complete: true`，唯一系统提示词）、`@deepseek-ai/dsh-tool-subagent`
（`provider: codex`、`toolName: subagent_codex`、`maxDepth: provider-managed`，同名遮蔽全局工具）、
`@deepseek-ai/dsh-tool-ask-user`、`@deepseek-ai/dsh-tool-todo`、compaction 组。

## 依赖

1. 目标机器装了 DeepSeek Harness，版本与 `peerDependencies` 声明的范围匹配（当前 `^0.2.2-rc.1`）。
2. 目标机器的 DSH profile 里已安装 codex 子代理 bundle `@deepseek-ai/dsh-subagent-codex`。
   缺了它 `provider: codex` 不存在，委派工具不会注册。
3. 目标机器装了 codex CLI 并完成认证（`~/.codex/config.toml`、凭据）。子代理用哪家的模型、
   走什么 provider、是否免审批，由目标机器自己的 codex 原生配置决定，**不随本 bundle 迁移**。

## 三种安装方式

### A. 本地目录（开发用，改完即时生效）

让 DSH 里的代理执行 `plugin_manager` `install_bundle`，target 为本目录绝对路径。
profile 记录的是 `link:<绝对路径>`，所以**目录装好后不要移动或删除**。

### B. 打包 tarball（已验证，免账号、可复现）

```sh
npm pack                       # 产出 dsh-codex-delegate-preset-1.0.0.tgz（约 6 KB）
```

把这个 `.tgz` 拷到目标机器，然后在 DSH 里：

> 帮我安装这个 bundle：`/abs/path/dsh-codex-delegate-preset-1.0.0.tgz`

`install_bundle` 直接接受 `.tgz` 路径，会作为普通包安装（不是 link）。这条路径已在
`0.2.2-rc.1` 上实测通过：安装后 `preset-codex` 为 `active`，版本 1.0.0。

### C. 私有 registry / GitHub Packages（推荐给多台机器）

1. 把包名改到你的 scope，并补齐仓库地址：

   ```jsonc
   {
     "name": "@lidaqi001/dsh-codex-delegate-preset",
     "repository": { "type": "git", "url": "git+https://github.com/lidaqi001/dsh-codex-delegate-preset.git" }
   }
   ```

   `publishConfig` 已预置为 GitHub Packages（`https://npm.pkg.github.com`，`access: restricted`）；
   用自建 registry（Verdaccio 等）时，发布命令加 `--registry` 覆盖即可。

2. 发布（GitHub Packages 需要带 `write:packages` 权限的 token）：

   ```sh
   # ~/.npmrc（或项目 .npmrc）
   @lidaqi001:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

   NODE_AUTH_TOKEN=<token> npm publish
   ```

3. 目标机器安装：先让该 profile 能解析这个 scope，再按 `name@version` 安装。

   ```sh
   # ~/.dsh/profiles/<profile>/.npmrc   （pnpm 在 profile 目录里执行，会读到它）
   @lidaqi001:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=<token>
   ```

   > 帮我安装 `@lidaqi001/dsh-codex-delegate-preset@1.0.0`

   `install_bundle` 的 target 直接写 registry spec（和官方插件
   `@deepseek-ai/dsh-subagent-codex@0.2.2-rc.1` 的装法一致）。

> 桌面版 DSH 从 Finder 启动时不继承终端的环境变量；token 用字面值写进 `.npmrc` 比
> `${NODE_AUTH_TOKEN}` 更稳，或从终端启动 app。

## 安装后验证

1. `plugin_manager` `list_plugins`：出现 `preset-codex`，`enabled: true`、`fiberPhase: active`；
2. `cordis_inspect_query` → `Config.listConfigs`（name = `@deepseek-ai/dsh-agent-preset`）
   能看到 `include:preset-codex`；
3. 新建会话，在「Agent 预设」里选 **Codex 委托**，给一个需要动手的任务，确认它只派发、
   不自己执行。

## 兼容性

- `peerDependencies` 把本 bundle 用到的 8 个 DSH 包钉在 `^0.2.2-rc.1`。DSH 升级到大版本
  （0.3+）后，先核对 patch 里用到的包名与配置字段，再改版本范围并重新发布。
- 子代理行为依赖 codex 侧：codex 大版本变更可能影响 `permissionMode` 的映射，升级后跑一次
  连通性验证（随便派一个 `echo` 任务）。

## 不要做的事

- 不要手工复制 `~/.dsh/profiles/*/package.json` 或 `cordis.patch.yml` 到新机器：
  `link:` 依赖记录的是绝对路径。用 `install_bundle` 装。
- 不要在 `$DSH_HOME` 或 profile 目录里手工建包、跑 pnpm：`install_bundle` 会处理。
- 不要把 `node_modules`、`*.tgz`、`.publish/` 提交进仓库（已在 `.gitignore`）。

## 调整模式

改 `cordis.patch.yml` 后重新 `install_bundle`（profile 配了 `patchReload: live`，新会话生效）：

- **更硬的约束**：加一个小 gate 插件，用 `ctx.tools.restrict({ allow: ['subagent_codex'] })`
  把全局工具（codegraph MCP、Agent Teams 等）也屏蔽掉——当前版本靠 persona 约束。
- **codex 权限**：在委派工具配置里加 `permissionMode`（默认 `never`）或改 codex 原生配置。
- **只保留委派**：去掉 `tool-todo`、`tool-ask-user`，同时删掉 persona 里对应的规则。

## 卸载

`plugin_manager` `remove_bundle`，target `@local/dsh-codex-delegate-preset`
（发布后用 `@lidaqi001/dsh-codex-delegate-preset`），或设置 → 插件里停用/移除。
