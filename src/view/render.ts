/* erdlens View — presentation. Turns a Mermaid string into the artifacts a doc
 * consumes: a fenced block, a self-contained HTML preview, and files on disk.
 */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";

export function fenced(mmd: string): string {
  return "```mermaid\n" + mmd + "\n```";
}

export function previewHtml(mmd: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>body{background:#0d0f12;color:#e7ecf3;font-family:system-ui;padding:24px}</style>
</head><body><h3>${title}</h3><pre class="mermaid">${mmd.replace(/</g, "&lt;")}</pre>
<script>mermaid.initialize({startOnLoad:true,theme:"dark"});<\/script></body></html>`;
}

// write .mmd + embeddable .md + self-contained .html; return a summary
export function writeDiagram(out: string, mmd: string, kind: string): string {
  const stem = out.replace(/\.(mmd|md|html)$/i, "");
  writeFileSync(out.endsWith(".mmd") ? out : stem + ".mmd", mmd);
  const mdPath = stem + ".md";
  writeFileSync(mdPath, `# ${basename(stem)} — ${kind}\n\n${fenced(mmd)}\n`);
  const htmlPath = stem + ".html";
  writeFileSync(htmlPath, previewHtml(mmd, basename(stem)));
  return `Wrote:\n  ${stem}.mmd  (Mermaid source)\n  ${mdPath}  (embeddable markdown)\n  ${htmlPath}  (open in a browser to preview)\n\nEmbed it in any doc with:\n\n${fenced(mmd)}`;
}
