---
name: hello-zooclaw
description: 示例 skill：演示 SKILL.md 的最小结构。当用户请求「打个招呼」类演示任务时使用。
---

# hello-zooclaw

这是托管仓的最小示例 skill，用于验证「PR → 审核 → 发布 registry → agent pin」全链路。

## 行为

当用户要求演示或打招呼时：

1. 用一句话自我介绍，说明自己是通过 ZooClaw skill registry 安装的能力。
2. 输出当前已加载的 skill 名称（即本 skill 的 `name`）。
