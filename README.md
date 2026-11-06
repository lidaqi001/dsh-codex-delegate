# dsh-codex-delegate

**Codex 委托模式** —— 一个把「所有处理都交给 codex 子代理」的 DeepSeek Harness Agent 预设（bundle）。

装上它之后，新建会话时在「Agent 预设」里选 **Codex 委托**：主代理不再自己读写文件、跑命令、
搜网页，而是理解需求、拆任务、把每个任务派给 `subagent_codex`（Codex 子代理）执行，最后汇总
结果。实质工作全部在 codex 里做。

- npm：`dsh-codex-delegate`
- DSH Agent 预设 id：`codex`
- 纯声明式 bundle：无插件代码、无需编译，7 KB

## 模式怎么工作

| 组成 | 作用 |
|---|---|
| `persona`（`complete: true`） | 该会话唯一的系统提示词：只做调度，不直接动手；委派必须自包含（子代理看不到会话、一次性、不接受追问）；异步等待不轮询；多阶段先派第一步；结果先核对验收再汇报 |
| `subagent_codex`（scoped，遮蔽全局同名工具） | 唯一的"干活"工具，`maxDepth: provider-managed`，同名遮蔽 profile 里的全局工具，其它会话配置不受影响 |
| `ask_user_question` | 需求有歧义时向用户确认 |
| `todo_write` | 多步委派的进度跟踪（只写会话日志） |
| `compaction` | 长会话里委派结果会持续累积，自动压缩 |

主代理**没有** bash / 文件 / 搜索工具，想自己动手也没工具可用。

## 安装

```sh
# 在 DSH 会话里直接说：
帮我安装 dsh-codex-delegate
```

代理会调用 `plugin_manager` 的 `install_bundle`，target 写 `dsh-codex-delegate` 或
`dsh-codex-delegate@1.0.0` 都行。

装完验证：

1. `plugin_manager` `list_plugins`：出现 `preset-codex`，`enabled: true`、`fiberPhase: active`；
2. `cordis_inspect_query` → `Config.listConfigs`（name = `@deepseek-ai/dsh-agent-preset`）能看到 `include:preset-codex`；
3. 新建会话 →「Agent 预设」选 **Codex 委托** → 给一个需要动手的任务，确认它只派发、不自己执行。

## 前置条件

1. DeepSeek Harness `^0.2.2-rc.1`（见 `peerDependencies`）。
2. profile 里已安装 codex 子代理 bundle `@deepseek-ai/dsh-subagent-codex`（缺了它 `provider: codex`
   不存在，委派工具不会注册）。
3. codex CLI 已安装并完成认证（`~/.codex/config.toml`）。子代理用哪个模型/provider、是否免审批，
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
# 打 v* tag 会触发 .github/workflows/publish.yml（需在仓库 Secrets 里配 NPM_TOKEN）
# 也可以本地直接发布：
npm publish                # publishConfig 已指向 registry.npmjs.org、access public
```

上架 awesome 列表：见 PR 模板用的条目（仓库内 `awesome-entry.md`）。

## 兼容性

- `peerDependencies` 把用到的 8 个 DSH 包钉在 `^0.2.2-rc.1`。DSH 大版本升级后先核对
  patch 里的包名/字段，再放宽范围并重新发布。
- codex 大版本变更可能影响 `permissionMode` 映射，升级后跑一次连通性验证（派一个 `echo` 任务）。

## 可调项

- **更硬的约束**：加一个小 gate 插件，用 `ctx.tools.restrict({ allow: ['subagent_codex'] })` 把
  全局工具（codegraph MCP、Agent Teams 等）也屏蔽掉——当前版本靠 persona 约束。
- **codex 权限**：在委派工具配置里加 `permissionMode`（默认 `never`），或改 codex 原生配置。
- **只保留委派**：去掉 `tool-todo`、`tool-ask-user`，同时删掉 persona 里对应的规则。

## 卸载

`plugin_manager` `remove_bundle`，target `dsh-codex-delegate`；或设置 → 插件里停用/移除。

## License

MIT
