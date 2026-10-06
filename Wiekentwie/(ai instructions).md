# AI instructions for the Wiekentwie project

Guidance for AI assistants (and humans) working on **Wiekentwie**: the Dutch
"Wie kent wie?" matchmaking app implemented as a single Excel VBA module.

## Before working

- Read this file and [`README.md`](README.md).
- Read [`Installatie-Excel.md`](Installatie-Excel.md) for the user-facing
  behaviour, the migration notes from the Google Sheets version, and the stated
  limitations. Keep that guide in sync with behaviour changes.
- Read the relevant macro in `WieKentWie.bas` and the matching cases in
  `tests/edge_cases.ps1` before changing behaviour.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `WieKentWie.bas` | The entire app: workbook setup, the `Aanbod` / `Zoeken` forms, storage in `Contacten`, normalization, and search. One importable VBA module. |
| `WieKentWie.xlsm` | Shipped workbook; it embeds a copy of the module. Regenerate/refresh the module after changing the `.bas`. **Git-ignored** — it holds real contact data and document metadata, so never commit it and never `git add -f` it. |
| `Installatie-Excel.md` | Dutch install/usage guide and the source of truth for documented behaviour. |
| `tests/edge_cases.ps1` | Executable specification: drives real Excel over COM and asserts the edge cases. |
| `tests/dismiss_dialog.ps1` | Test helper that finds and dismisses the module's modal `MsgBox` dialogs. |

## Project constraints

- **Excel for Windows only.** The module relies on `Scripting.Dictionary`, which
  is unavailable on Mac and Excel for the web. Do not claim Mac support.
- **Keep the module ASCII-only.** `WieKentWie.bas` must stay import-safe; ASCII
  source avoids encoding problems when importing or pasting. Non-ASCII input is
  handled at runtime, not in the source.
- **All user-facing text is Dutch**, including `MsgBox` text, sheet names, and
  comments. Keep new strings Dutch and consistent with the existing tone.
- **Stay decoupled from the workbook layout where the code already is.** Sheet
  names and ranges are named constants at the top of the module
  (`TAB_NAME`, `SHEET_OFFER`, `SHEET_SEARCH`, `CONTACT_RANGE`, …); reuse them
  instead of hardcoding new ranges.
- **Fail with a clear Dutch message, not a raw VBA error.** The macros raise
  `FOUT_NR` errors and show a readable `MsgBox`; follow that pattern.
- **Preserve the documented search rules:** case/accent/punctuation/whitespace
  normalization, handling of characters outside the standard table, one person
  per identical full name, single-name linking, and the 30-result / 50-contact
  limits.

## Editing workflow

1. Change `WieKentWie.bas` (the single source of the logic).
2. Update `Installatie-Excel.md` and `README.md` if user-facing behaviour,
   setup, or limits change.
3. Add or update the matching case in `tests/edge_cases.ps1`.
4. Run the tests (below). Do not consider the change done until they pass, or
   record clearly why they could not run.

## Validation

From the repository root:

```text
powershell -ExecutionPolicy Bypass -File tests\edge_cases.ps1
```

- Requires **Excel for Windows** and PowerShell. The script uses a throwaway
  workbook and does not modify `WieKentWie.xlsm`.
- It temporarily enables "Trust access to the VBA project object model" to import
  the `.bas`, and restores the previous value at the end.
- Modal dialogs are dismissed automatically by `tests/dismiss_dialog.ps1`.
- Exit code `0` means every case passed.

If Excel is not available, the tests cannot run; say so explicitly rather than
reporting a pass.
