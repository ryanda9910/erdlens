# Contributing

erdlens is TypeScript, laid out MVVM and compiled to `dist/`:

- **Model** (`src/model/`) — pure logic + types: `erd.ts` (schema → ER model), `flow.ts` (workflow →
  graph), `drift.ts` (diff two schemas), `types.ts`.
- **ViewModel** (`src/viewmodel/`) — orchestration: `diagram.ts` (tool operations = model + file I/O),
  `tune.ts` (the self-improving loop).
- **View** (`src/view/`) — surfaces: `mcpServer.ts` (JSON-RPC stdio), `cli.ts`, `render.ts`
  (Mermaid/HTML presentation). `src/index.ts` is the composition root.

Contributions that parse more schemas correctly, or make drift sharper, are welcome.

## Good contributions

- **A schema it parses wrong** — a SQL dialect or ORM construct that comes out with the wrong table,
  column, PK/FK, or relation. Open an issue with the input, add a failing assertion to
  `test/erd.test.mjs`, then the fix in `src/model/erd.ts`.
- **A drift miss** — a schema change `drift_check` doesn't notice. Add a case to the drift tests.
- **A new schema source** — another ORM or IDL. Add a `parseX` in `src/model/erd.ts`, wire it into
  `detect` and `parse`, and test it.
- **A workflow feature** — a DSL/JSON construct in `src/model/flow.ts`.
- **A translation** — add a `README.<lang>.md` and link it in the language row.

## Rules

- Keep it zero **runtime** dependency. Model/ViewModel/View must not pull runtime deps (dev deps like
  TypeScript are fine).
- Respect the MVVM boundary: a View never imports a Model directly — it goes through a ViewModel.
- Every change to a parser, drift, or flow needs a test. `npm test` builds and runs 57 assertions.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint via a husky
`commit-msg` hook (installed automatically on `npm install`) and in CI. Types: `feat`, `fix`, `docs`,
`style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## License

By contributing you agree your work is MIT-licensed.
