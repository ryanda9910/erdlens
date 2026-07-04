# Contributing

erdlens is an MCP server (`src/server.js`) over a zero-dependency schema engine (`src/erd.cjs`) and a
drift checker (`src/drift.cjs`). Contributions that parse more schemas correctly, or make drift sharper,
are welcome.

## Good contributions

- **A schema it parses wrong** — a SQL dialect, Prisma/Drizzle/TypeORM/SQLAlchemy construct that comes
  out with the wrong table, column, PK/FK, or relation. Open an issue with the input, add a failing
  assertion to `test/erd.test.mjs`, then the fix.
- **A drift miss** — a schema change `drift_check` doesn't notice. Add a case to the drift tests.
- **A new schema source** — another ORM or IDL. Add a `parseX` in `src/erd.cjs`, wire it into `detect`
  and `parse`, and test it.
- **A translation** — add a `README.<lang>.md` and link it in the language row.

## Rules

- Keep it zero-dependency. The MCP server, parsers, and drift check must not pull runtime deps.
- Every change to a parser or to drift needs a test. Run `npm test` (37 assertions today).

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>)?: <subject>` —
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
CI lints every PR. Enable the dep-free local hook once:

```bash
git config core.hooksPath .githooks
```

## License

By contributing you agree your work is MIT-licensed.
