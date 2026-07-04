<p align="center">
  <img src="assets/logo.svg" alt="erdlens" width="96" height="96" />
</p>

<h1 align="center">erdlens</h1>

<p align="center"><b>你的 schema 直接变成 ER 图写进文档，还会在图过时时提醒你。</b></p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a> · 🇨🇳 简体中文
</p>

---

你让 Claude Code 给数据库写文档。它写好了文档，你却要在另一个工具里画 ER 图，再复制粘贴回文档。两个
工具、双倍工作。而且只要有人跑了一次迁移，文档里的图就悄悄错了。

**erdlens** 是一个把这个闭环补上的 MCP server。Claude Code 读取你的 schema，转成 Mermaid ER 图，一次
性**写进**文档。不需要第二个工具，不需要复制粘贴。之后它还能检查这张图是否仍与 schema 一致。

## 为什么不一样

现有的图表 MCP 只是渲染你已经写好的 Mermaid。erdlens 往前一步：**替你读取 schema**；往后一步：
**监控漂移（drift）**。

schema 来源：**SQL DDL、Prisma、Drizzle、TypeORM、SQLAlchemy** —— 文件或文本，自动识别。

## 安装（Claude Code）

```bash
claude mcp add erdlens -- npx -y github:ryanda9910/erdlens
```

然后直接对 Claude Code 说：*"给数据库写文档，并把 ER 图放到 docs/schema.md"*。它会调用 `render_erd`，
图就落进文件里。

## 工具

- `schema_to_erd` —— schema → Mermaid `erDiagram` + 可直接粘贴的 ```mermaid 代码块。
- `render_erd` —— 写入磁盘：`.mmd` + 可嵌入的 `.md` + 自包含的 `.html` 预览。
- `drift_check` —— 对比文档里的 ERD 与当前 schema，报告新增/删除的表、列、关系。放进 CI，过时的图会
  让构建失败。

## 漂移检查

```
$ erdlens drift docs/schema.md db/schema.sql
Diagram is stale. It drifted from the current schema:
  + tables added since: audit_logs
  ~ posts: +published +slug
```

过时时退出码非零 —— 适合 CI 或 pre-commit hook。

## 测试

```bash
npm test    # 24 个引擎断言 + 13 个 MCP stdio 断言
```

零依赖。

## 许可证

MIT
