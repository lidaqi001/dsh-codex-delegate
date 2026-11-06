/**
 * Codex-only guard.
 *
 * Mounted inside the `codex` preset composition, so the guard lands in the
 * preset's layer. `ctx.tools.guard()` is checked at execution time for every
 * call whose agent resolves through that scope chain, and a returned string
 * denies the call. That gives a hard "only the delegation tool" rule without
 * touching tool visibility:
 *
 *  - `tools.restrict()` would filter the preset layer's own registrations too
 *    (the viewing scope is the agent, so preset tools are inherited, not exempt),
 *    which would hide `ask_user_question` and `todo_write`.
 *  - A guard names the calls it denies, so it cannot break a preset tool by
 *    accident, and it never affects other presets or the global tool view.
 *
 * Calls made outside an agent (programmatic service calls, no `exec.agent`) are
 * left alone; the guard only governs model-facing turns.
 *
 * @module dsh-codex-delegate
 */

export const name = 'codex-only-guard'

export const inject = ['tools']

export const DEFAULT_ALLOWED = ['subagent_codex', 'ask_user_question', 'todo_write']

export const DEFAULT_REASON =
  '「Codex 委托」模式只允许把工作交给 codex 子代理（subagent_codex）：需要澄清用 ask_user_question，' +
  '进度跟踪用 todo_write。其它工具在本模式下不可用，请改为委派。'

/**
 * @param {unknown} value configured allowlist
 * @returns {string[]} normalized allowlist
 */
function normalize(value) {
  const list = Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : []
  return list.length > 0 ? [...new Set(list)] : DEFAULT_ALLOWED
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx preset context
 * @param {{ allowed?: string[], reason?: string }} [config] plugin config
 */
export function apply(ctx, config = {}) {
  const allowed = new Set(normalize(config.allowed))
  const reason = typeof config.reason === 'string' && config.reason.length > 0 ? config.reason : DEFAULT_REASON

  ctx.effect(() =>
    ctx.tools.guard((exec) => {
      if (exec.agent === undefined) return undefined
      return allowed.has(exec.name) ? undefined : reason
    }),
  )
}
