# dsh-codex-delegate

**Codex 委托模式** —— 一个把「所有处理都交给 codex 子代理」的 DeepSeek Harness Agent 预设（bundle）。

装上它之后，新建会话时在「Agent 预设」里选 **Codex 委托**：主代理不再自己读写文件、跑命令、
搜网页，而是理解需求、拆任务、把每个任务派给 `subagent_codex`（Codex 子代理）执行，最后汇总
结果。实质工作全部在 codex 里做。

- npm：`dsh-codex-delegate`
- DSH Agent 预设 id：`codex`
- 纯 YAML 配置 + 一个很小的 Host 插件（`index.js`，约 1 KB），无需编译

## 模式怎么工作

| 组成 | 作用 |
|---|---|
| `persona`（`complete: true`） | 该会话唯一的系统提示词：只做调度，不直接动手；委派必须自包含（子代理看不到会话、一次性、不接受追问）；异步等待不轮询；多阶段先派第一步；结果先核对验收再汇报 |
| `subagent_codex`（scoped，遮蔽全局同名工具） | 唯一的"干活"工具，`maxDepth: provider-managed`；指向 bundle 自带的专用 provider `codex-delegate`（`permissionMode: approve-for-me`），同名遮蔽全局工具，其它会话配置不受影响 |
| `ask_user_question` | 需求有歧义时向用户确认 |
| `todo_write` | 多步委派的进度跟踪（只写会话日志） |
| `codex-only-guard` | **工具级硬限制**：preset 层注册执行期 guard，除上面三个工具外，任何工具调用都被拒绝 |
| `compaction` | 长会话里委派结果会持续累积，自动压缩 |

预设里只挂载了委派/澄清/进度/压缩四类工具，没有 bash / 文件 / 搜索工具。profile 里 Host 级注册的全局工具（MCP、Agent Teams 等）**仍会出现在工具列表里**，但 `codex-only-guard` 会在执行时直接拒绝它们，返回"本模式下不可用，请改为委派"。

为什么用 guard 而不是 `ctx.tools.restrict`（可见性遮罩）：`restrict` 会把 preset 层注册的工具也一起过滤，连 `ask_user_question`、`todo_write` 都会被隐藏；guard 只按工具名拒绝调用，不会误伤，也不会影响其它预设/其它会话。

## 安装

```sh
# 在 DSH 会话里直接说：
帮我安装 dsh-codex-delegate@1.0.2
```

代理会调用 `plugin_manager` 的 `install_bundle`，target 写 `dsh-codex-delegate`（装 latest）
或带版本号都行。

装完验证：

1. `plugin_manager` `list_plugins`：出现 `preset-codex`，`enabled: true`、`fiberPhase: active`；
2. `cordis_inspect_query` → `Config.listConfigs`（name = `@deepseek-ai/dsh-agent-preset`）能看到 `include:preset-codex`；
3. 新建会话 →「Agent 预设」选 **Codex 委托** → 给一个需要动手的任务，确认它只派发、不自己执行。

## 前置条件

1. DeepSeek Harness `^0.2.2-rc.1`（见 `peerDependencies`）。
2. profile 里已安装 codex 子代理 bundle `@deepseek-ai/dsh-subagent-codex`。本 bundle 在 Host 层
   插入自己的 provider 行（`providerName: codex-delegate`），该插件包必须能被解析，否则 provider
   与委派工具都不会注册。
3. codex CLI 已安装且已登录（`codex login status` 显示已登录，或已配置等效的认证方式；凭据与 `~/.codex/config.toml` 配置是两回事）。子代理用哪个模型/provider、是否免审批，
   由目标机器自己的 codex 原生配置决定。
4. 本 bundle 通过 `link:` 或 registry 安装均可；若是 `link:`，目录不要移动或删除。

## 本地开发

```sh
# 装进当前 profile（目录形式，改完即时生效）
# 在 DSH 里：帮我安装 /abs/path/to/dsh-codex-delegate

npm pack           # 打 tarball（install_bundle 也直接吃 .tgz）
```

改 `cordis.patch.yml` 后重新 `install_bundle` 即可（profile 配了 `patchReload: live`，新会话生效）。

## 发布

```sh
npm version patch          # 或手动改 version
git push && git push --tags
# 打 v* tag 会触发 .github/workflows/publish.yml（用仓库 Secrets 里的 NPM_TOKEN，带 --provenance）
# 规则：tag 必须等于 v<package.json 里的 version>，同一版本不可重发，需先 bump
# 也可以本地直接发布：
npm publish                # publishConfig 已指向 registry.npmjs.org、access public
```

上架 awesome-dsh-plugin：条目草稿在仓库根目录 `awesome-entry.yml`；正式 PR 需把它提交到对方仓库的 `data/plugins/lidaqi001__dsh-codex-delegate.yml`（一个 PR 只加这一个文件）。

## 兼容性

- `peerDependencies` 把用到的 9 个 DSH 包钉在 `^0.2.2-rc.1`。DSH 大版本升级后先核对
  patch 里的包名/字段，再放宽范围并重新发布。
- codex 大版本变更可能影响 `permissionMode` 映射，升级后跑一次连通性验证（派一个 `echo` 任务）。

## 可调项

- **硬限制的允许列表**：`codex-only-guard` 的 `allowed` 可改（默认 `subagent_codex`、`ask_user_question`、`todo_write`）；
  想去掉澄清/进度工具就同时删掉对应插件行。若想让主代理连"看到"都要更干净，只能在没有 preset 层
  工具的前提下改用 `ctx.tools.restrict`，但会一并隐藏 preset 自己的工具，需要实测后再上。
- **codex 权限与沙箱**：`permissionMode` 写在 provider 行（`subagent-codex-delegate`），不是工具行：
  - `approve-for-me`（当前默认）：`approvalPolicy: on-request` + 自动审批 + `sandbox: workspace-write`
    → **工作区可写**，无人值守也能跑；需要越界的操作走 codex 自动审批。
  - `never`：`approvalPolicy: never`，沙箱不显式指定，实测拿到的是**只读沙箱**——工作区内也写不了文件
    （`operation not permitted`），只有读/检索/联网可用。
  - `dangerously-bypass-approvals-and-sandbox`：无审批、全盘可写，慎用。
  另外 codex 原生配置（`~/.codex/config.toml`）仍会叠加，例如 `network_access`、模型选择等。
- **只保留委派**：去掉 `tool-todo`、`tool-ask-user`，同时删掉 persona 里对应的规则。

## 卸载

`plugin_manager` `remove_bundle`，target `dsh-codex-delegate`；或设置 → 插件里停用/移除。

## 变更记录

### 1.0.2

- 新增 `codex-only-guard`（preset 层执行期 guard）：除 `subagent_codex`、`ask_user_question`、`todo_write`
  外的工具调用一律被拒绝，把"只能把活交给 codex"从提示词约束升级为**运行时强制**。
- persona 增加一句：其它工具即使可见也会被系统拒绝，不要尝试。
- 包结构从"纯声明式"变为带一个 Host 插件（`index.js`），`exports` 增加 `.`。

### 1.0.1

- **新增专用 provider `codex-delegate`（`permissionMode: approve-for-me`）**：修复默认 `never` 下
  codex 沙箱为只读、工作区内也无法写文件的问题（实测）；委派工具改为指向该 provider。
- persona 重写：明确"子代理不能中途提问，决策要提前写进任务"、完成通知到达前不得声称结果、
  区分成功/部分完成/失败/阻塞、后续任务必须附上前次结果、汇报只能陈述子代理明确报告过的改动与验证。
- 移除 `includeRuntimeContext: false`（`complete: true` 已限定提示词范围，这一项只是重复抑制）。
- `peerDependencies` 补上 `@deepseek-ai/dsh-subagent`（`dsh-tool-subagent` 依赖的服务包）。
- CI 加固：action 固定 commit SHA、`--provenance`、tag 与版本一致性校验、只在 404 时发布、并发组。
- README 修正：不再声称"主代理没有工具"、认证说明改为 `codex login status`、awesome 投稿路径修正。

### 1.0.0

- 首个版本：`preset-codex`（persona + scoped `subagent_codex` + `ask_user_question` + `todo_write` + compaction）。

## License

MIT
