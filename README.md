# zooclaw-sdk-skills — 教 AI 编程助手构建 ZooClaw Agents 的 Skills

> 定位（2026-08-06 定）：**给客户的 AI 编程助手用的知识包**——装上后，Claude Code /
> Cursor 等编程 agent 就知道怎么用 ZooClaw Managed Agents API / SDK 正确地构建集成。
> 直接先例：`anthropics/skills` 里的 `skills/claude-api/python/managed-agents`
> （Anthropic 把自家 Managed Agents API 教程做成 skill 发在 org 最大的公开仓里）。
>
> **SDK 和 skill 的分工**：SDK 给客户的**代码**在运行时调 API；skill 给客户的
> **AI 编程助手**在写代码时学会怎么用 SDK。一个是 runtime 库，一个是知识打包。
> 浩霖那句「写一个文档让你的 ai 自己 build 一个起来」的正规形态就是这个仓。

## 目录规范

```
skills/
  <skill-name>/
    SKILL.md          # 必须：frontmatter(name, description) + 给 agent 的规程正文
    references/       # 可选：SKILL.md 按需引用的深入文档
    scripts/          # 可选：可执行脚本
```

结构对标 `anthropics/skills`（一目录一 skill；作者模板抄它的 `template/`）。

## 首批 skill 规划

| skill | 内容 | 状态 |
|---|---|---|
| `zooclaw-managed-agents` | 教编程 agent 用 Managed Agents API/SDK：agent 是 create-once-reference-by-ID、session 生命周期、SSE `?after=` 续传、`run.finished` 终止、两种 auth 模式 | ⬜ 骨架已建，正文待写（原料：SMOKE.md 五步、SDK README、app-kit 用法） |
| `hello-zooclaw` | SKILL.md 最小结构示例 | ✅（历史遗留，格式示例） |

## 与「平台 Skill 托管仓」的关系（原 skills/ 构想，已并入本仓放缓）

ZooClaw 平台自己有**运行时 skill registry**（DB-backed，`skl_...` id，
`putAgentSkill` 安装到 agent 上）——那是**另一种 skill**（装在 ZooClaw agent 上的能力，
不是装在编程助手上的知识）。原计划的第三方托管仓（PR → 审核 → CI 上传 registry）
因发布管线依赖未实施的 API key 层而后置；若将来启动，可在本仓加 `registry/` 目录或另立仓。
概念辨析见 zooclaw-engine `CONTEXT.md` 的「skill 三义」。

## 待办

- [ ] `zooclaw-managed-agents` skill 正文（等 SDK quickstart 文档写完可直接改造）
- [ ] CONTRIBUTING.md：评审标准（安全审查！skill 是提示词注入面）
- [ ] 公开前 scrub：去内部主机名/人名（见 ../REPO-PLAN.md 清单）
