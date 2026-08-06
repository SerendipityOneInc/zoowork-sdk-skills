---
name: zooclaw-managed-agents
description: 教 AI 编程助手使用 ZooClaw Managed Agents API / SDK 构建 agent 集成。当用户要求编写调用 ZooClaw agent、创建 session、消费事件流的代码时使用。
---

# ZooClaw Managed Agents — 给编程助手的规程

> ⬜ 骨架 — 正文待写。原料：workbench 的 SMOKE.md（五步 curl）、sdk-typescript README、
> zooclaw-app-kit（完整消费者示例）。等 SDK quickstart 文档定稿后改造成本 skill 正文。
> 先例参照：anthropics/skills → skills/claude-api/python/managed-agents。

## 核心事实（正文要展开的骨架）

1. **Agent 是 create-once-reference-by-ID**：`agent_id` 长期持有，不要每次重建。
2. **一个会话 = 一个 session**：`POST /v1/agents/{id}/sessions`（带 `initial_events`）开场，
   后续 `POST .../events`；session 内上下文由平台维护，客户端不重发历史。
3. **读事件用 SSE，断线用 `?after=<seq>` 续传**：durable seq 在 `id:` 行；
   `run.finished`（payload.status: succeeded|failed|aborted）是一轮的终点。
4. **事件两种信封**：REST snake_case / SSE camelCase——用 SDK 的归一化，别手写解码。
5. **auth 两模式**：`{serviceToken}`（内部）/ `{apiKey}`（对外，façade 上线后）。
