# CLAUDE.md

@AGENTS.md

The shared rules above, from `AGENTS.md`, apply in full. This file adds only
notes specific to Claude Code. If anything here seems to conflict with
`AGENTS.md`, `AGENTS.md` wins. Report the conflict.

## Claude Code notes

- **Reviews:** a review task is read-only. Group findings as:
  - **Blocking:** breaks behavior, loses data, gives wrong financial
    results, or breaks an accessibility or RTL requirement.
  - **Important:** should be fixed before merge.
  - **Optional.**

  For each finding, give the file and line, why it matters, and the
  smallest fix. If there are no blocking findings, say so.
- **Browser checks:** for meaningful UI changes, run the app and check it at
  mobile and desktop widths (and, once localization exists, in `en` and
  `he`). Report what you actually saw.
- **Context:** read the documents named in `AGENTS.md` §3 when the task
  needs them, rather than assuming their contents.
