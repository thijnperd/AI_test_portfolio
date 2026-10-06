# Wiekentwie ("Wie kent wie?")

A small Dutch matchmaking app that runs entirely inside one Excel workbook.
People record **what they offer** ("I know these people") and **who or what they
are looking for**; the app matches searches against the stored contact lists.

This is the Excel/VBA version of an earlier Google Apps Script web app. It
replaces `Code.gs` + `Index.html` with a single VBA module, so no Google
account, Apps Script, or hosting is needed — just Excel for Windows.

> The user-facing guide is written in Dutch: see
> [`Installatie-Excel.md`](Installatie-Excel.md) for installation, usage,
> migration from Google Sheets, and the limits of this version.

## How it works

Everything lives in one workbook. `Setup` builds three sheets:

| Sheet | Role |
|---|---|
| `Aanbod` | "I know people" form — first name, last name, available-until date, and a list of contacts |
| `Zoeken` | "I'm looking for someone" form with a search box and results |
| `Contacten` | The stored data, hidden as `VeryHidden` |

`OpslaanAanbod` validates and stores an offer; `ZoekAanbod` normalizes the query
(case, accents, punctuation, and extra whitespace) and returns up to 30 matches
from providers whose availability date has not passed.

## Project files

| File | Purpose |
|---|---|
| `WieKentWie.bas` | The whole app: one importable VBA module (forms, storage, search). |
| `WieKentWie.xlsm` | A ready-made workbook that already contains the module. **Not committed — it holds real data.** |
| `Installatie-Excel.md` | Dutch install/usage guide, migration notes, and limitations. |
| `tests/edge_cases.ps1` | Executable specification — drives real Excel via COM and checks the edge cases. |
| `tests/dismiss_dialog.ps1` | Helper that auto-dismisses the module's modal `MsgBox` dialogs during tests. |
| `(ai instructions).md` | Guidance for AI assistants and contributors working on the module. |

> **The workbook is not committed to this repository.** `WieKentWie.xlsm` holds
> real contact data and document metadata, so it is git-ignored. To run the app,
> create a new macro-enabled workbook and import `WieKentWie.bas` into it — see
> [`Installatie-Excel.md`](Installatie-Excel.md).

## Requirements

- **Excel for Windows** — the module uses `Scripting.Dictionary`, which does not
  exist on Mac or in Excel for the web.
- **PowerShell** (Windows) to run the tests.

## Tests

From the repository root:

```text
powershell -ExecutionPolicy Bypass -File tests\edge_cases.ps1
```

The script imports `WieKentWie.bas` into a throwaway workbook, runs the macros
for real, and checks sheet setup, saving, searching, dates, special characters,
and the row/result limits. Your `WieKentWie.xlsm` is not modified. Exit code `0`
means all tests passed.

## Limitations

- **Single user at a time.** An Excel file is not a web server; sharing the file
  gives each person their own copy.
- **No real secrecy.** Anyone with the file can unhide the `Contacten` sheet and
  read every list. `VeryHidden` and sheet protection are deterrents, not locks.
- **Search runs from the button** — pressing Enter in the search field does not
  start a search.
