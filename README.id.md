<p align="center">
  <img src="assets/logo.svg" alt="erdlens" width="96" height="96" />
</p>

<h1 align="center">erdlens</h1>

<p align="center"><b>Skema kamu jadi diagram ER, langsung masuk ke dokumen. Dan dia kasih tahu saat diagram-nya basi.</b></p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> · 🇮🇩 Bahasa Indonesia · <a href="README.zh-CN.md">🇨🇳 简体中文</a>
</p>

---

Kamu minta Claude Code dokumentasiin database. Dia tulis doc-nya, kamu bikin diagram ER di tool lain,
lalu copy-paste balik ke doc. Dua tool, kerja dua kali. Dan begitu ada yang jalankan migration,
diagram di dokumen jadi salah tanpa ketahuan.

**erdlens** MCP server yang nutup loop itu. Claude Code baca skema kamu, ubah jadi diagram ER Mermaid,
dan tulis **langsung ke dalam** dokumen sekali jalan. Tanpa tool kedua, tanpa copy-paste. Dan dia bisa
cek belakangan apakah diagram itu masih cocok sama skema.

## Kenapa beda

MCP diagram yang ada cuma render Mermaid yang sudah kamu tulis. erdlens mulai satu langkah lebih awal:
dia **baca skema-nya untukmu**, dan satu langkah lebih lama: dia **pantau drift**.

Sumber skema: **SQL DDL, Prisma, Drizzle, TypeORM, SQLAlchemy** — file atau teks, auto-deteksi.

## Install (Claude Code)

```bash
claude mcp add erdlens -- npx -y github:ryanda9910/erdlens
```

Lalu tinggal minta Claude Code: *"dokumentasiin database dan taruh diagram ER di docs/schema.md"*.
Dia panggil `render_erd`, diagram-nya masuk ke file.

## Tools

- `schema_to_erd` — skema → Mermaid `erDiagram` + blok ```mermaid siap tempel.
- `render_erd` — tulis ke disk: `.mmd` + `.md` embeddable + preview `.html`. Langsung masuk doc.
- `drift_check` — bandingkan ERD di dokumen vs skema sekarang, laporkan tabel/kolom/relasi yang
  ditambah/dihapus. Jalankan di CI biar diagram basi bikin build gagal.

## Drift check

```
$ erdlens drift docs/schema.md db/schema.sql
Diagram is stale. It drifted from the current schema:
  + tables added since: audit_logs
  ~ posts: +published +slug
```

Exit code non-nol kalau basi → cocok buat CI atau pre-commit hook.

## Test

```bash
npm test    # 24 assertion engine + 13 assertion MCP stdio
```

Zero dependency.

## Lisensi

MIT
