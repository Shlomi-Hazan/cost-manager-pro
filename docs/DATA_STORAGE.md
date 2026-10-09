# Cost Manager Pro — Data Storage, Backup, and Recovery

**Status:** Implemented in M1. Decisions: ADR-042 (storage namespace,
format, and migrations) and ADR-043 (backup and restore).

Cost Manager Pro is local-first. Everything is stored in the browser's
`localStorage` for the site's **origin** (scheme + host + port). Clearing
site data, using another browser, or using another device means different
or no data. Users should download backups.

## 1. Storage keys

| Key | Contents | Notes |
|---|---|---|
| `cost-manager-pro:costsdb:v2:costs` | The expense dataset (§2) | `costsdb` and `v2` come from `openCostsDB(name, version)`. They identify the dataset; they are **not** the format version |
| `cost-manager-pro:costsdb:v2:costs:previous` | One "previous data" safety copy (§5) | Updated only after a replacement is written and verified |
| `cost-manager-pro:costsdb:v2:costs:previous:pending` | The next safety copy, while a replacement is in progress (§5) | Normally removed at the end of the operation |
| `cost-manager-pro:settings` | `{ exchangeRatesUrl? }` | No financial data |
| `cost-manager-pro:exchange-rates-cache` | Last validated rates | Can always be fetched again |

Keys used by the original course app on the same origin are **never written
by Cost Manager Pro**: `cost-manager:costsdb:v1:costs`,
`cost-manager:costsdb:v2:costs`, `cost-manager:settings`, and
`cost-manager:exchange-rates-cache`. Only `cost-manager:costsdb:v2:costs`
is ever *read*, to offer an explicit import (§6).

## 2. Dataset format and schema versions

```json
{
  "schemaVersion": 1,
  "costs": [
    {
      "id": "3f7c…",
      "sum": 1234.56789,
      "currency": "ILS",
      "category": "Food",
      "description": "Groceries",
      "date": { "day": 29, "month": 2, "year": 2028, "hour": 23, "minute": 59 }
    }
  ]
}
```

- **Schema 1 (current):** the document above.
- **Schema 0 (before M1):** a bare JSON array of the same records.

Every record must pass the same validation as the `db.js` API:

- a non-empty string `id`, unique within the dataset
- a finite number `sum`
- `currency` is one of `USD`, `ILS`, `GBP`, `EURO`
- string `category` and `description`
- an integer `date` with all of `day`, `month`, `year`, `hour`, `minute`, forming a real calendar date and time

Amounts are stored as JSON numbers and are never rounded by the storage
layer. `EURO` is unchanged; moving to ISO `EUR` is planned for M2.

## 3. Migration policy

- Migrations are small, pure functions that upgrade schema `N` to `N + 1`
  (`src/lib/storage/costDocument.js`). They run in memory, then the result
  is validated in full.
- **Reading never writes.** Older data is upgraded only on the next save.
  Before that first save, the original value is kept as previous data with
  reason `schema-migration`.
- If the save fails partway (for example, storage is full), the original
  value is still in place and readable, and the migration simply runs again
  next time. Saving the same data repeatedly gives the same result.
- **Newer formats are refused, not destroyed:** data with a higher
  `schemaVersion` than this app supports is reported as `unsupported`, and
  saving is paused. It can be downloaded exactly as stored.
- Any schema change needs a new migration step, tests with realistic data,
  and an ADR.

## 4. Data-loss safeguards

| Situation | What happens | Data at risk? |
|---|---|---|
| Nothing stored | `empty`: starts with an empty list | No |
| Malformed JSON, wrong root type, a missing field, an invalid record, or a duplicate id | `damaged`: reads throw a `StorageError` and **saving is paused**. The value is never overwritten or partly discarded. A banner appears on every page | No. The exact value can be downloaded |
| Newer schema version | `unsupported`: same as damaged | No |
| The browser refuses to read storage | `unavailable`: reads and writes throw, and nothing is written | No |
| Storage is full when saving | `quota-exceeded`: the write is rejected by the browser. The previous value stays, and the user is told. Add Cost keeps the typed form values | No |
| Another write failure | `write-failed`: same as above | No |
| Another tab changed the data | Every operation re-reads storage. Just before writing, it checks the data still equals what it read; if not, `conflict` is reported and nothing is saved. Manage Costs, the banner, and Settings refresh on the browser's `storage` event | Small remaining risk; see §8 |

User-facing messages for each case are in `src/utils/storageErrorMessage.js`.

## 5. Previous data (the safety copy)

Restoring a backup, importing earlier data, resetting unreadable data,
undoing ("Restore previous data"), and the schema-migration save all keep
the replaced value as previous data. The record format is:

```json
{
  "format": "cost-manager-pro-previous-data",
  "reason": "restore",
  "createdAt": "2026-10-09T08:15:00.000Z",
  "rawValue": "<the exact replaced string>"
}
```

**Commit sequence** (`commitWithPreviousData` in
`src/lib/storage/costStore.js`):

1. Stage the copy of the current value under `…:previous:pending`. If this
   fails, nothing has changed.
2. Check that the data still equals the value that was read. If another
   tab changed it, stop with a `conflict` error; nothing is changed.
3. Write the new data. If this fails, the data and the existing snapshot
   are both unchanged.
4. Read the data back. If it is not exactly what was written, write the
   earlier value back. If that rollback also fails, report
   `recovery-incomplete`; the earlier value is still held under the
   pending key.
5. Copy the staged copy into `…:previous`, then remove the pending key.

At every step, the earlier data, the new data, and the earlier snapshot
each exist in at least one key. A pending copy left by a closed tab or a
failed late step is resolved by comparing it with the current data:

- **The data still equals the staged value:** the replacement never
  happened, so the staged copy is a duplicate and is discarded.
- **Otherwise:** the staged copy is the real previous data. Settings shows
  it, and the next replacement moves it into `…:previous`.

Reading never writes; this resolution happens only at the start of the
next replacement.

- Only **one** copy is kept. To avoid losing something valuable, an empty
  dataset never replaces an existing copy. Confirmation dialogs say when a
  copy will be replaced.
- In Settings, the copy can be:
  - **downloaded:** as a normal backup when it is readable, otherwise
    exactly as stored
  - **restored:** a swap, so it can be undone

## 6. Data saved before M1 (existing users)

Before M1, this code stored data under `cost-manager:costsdb:v2:costs`.
The original course app uses exactly the same key. On a shared origin (for
example `localhost` during development), that data may belong to either
app.

- The Pro app **does not read it automatically** and **never changes it**.
- While Pro's own dataset is empty, Settings offers **"Import a copy…"**
  with a confirmation. The records are copied unchanged (same ids, amounts,
  dates); the original key is left as it was.
- The old custom exchange-rate URL setting is not imported; set it again in
  Settings if needed.
- Course-era version 1 data (`…:v1:costs`, records without ids or times)
  is not supported, as before M1.
- On a new origin (such as a Vercel domain) there is no earlier data, so
  nothing is offered.

## 7. Backup file format (version 1)

```json
{
  "format": "cost-manager-pro-backup",
  "formatVersion": 1,
  "exportedAt": "2026-10-09T08:15:00.000Z",
  "app": "Cost Manager Pro",
  "costCount": 2,
  "costs": [ { "...": "records exactly as stored (§2)" } ]
}
```

- **File name:** `cost-manager-pro-backup-YYYY-MM-DD-HHmm.json`, in local
  time.
- **Contents:** expenses only. Settings and cached rates are not included,
  and there are no secrets.
- **Restore is all or nothing:**
  1. The whole file is parsed and validated first:
     - format name
     - format version (newer versions are rejected)
     - creation date
     - `costCount` matches the number of records
     - every record is valid
     - ids are unique
  2. Nothing changes until the user confirms in a dialog that states what
     will be replaced.
  3. The current data is then kept as previous data, the backup is
     written, and the result is read back to verify it.
- Duplicate ids in a backup are rejected, never merged. v1 has no merge
  mode: a restore replaces the whole dataset.
- Files over 10 MB are rejected.

## 8. Known limitations

- `localStorage` is limited (usually about 5 MB per origin). The safety
  copy roughly doubles the space a dataset needs during a replacement.
- Only one previous-data copy is kept.
- **No cross-tab atomicity.** `localStorage` has no transactions and no
  compare-and-swap.
  - Each save re-reads the data immediately before writing and refuses on
    a mismatch (`conflict`). That narrows the window, but cannot close it:
    another tab could still write between that check and the write
    (microseconds apart), and the later write wins.
  - A multi-step replacement is not atomic either. The commit sequence
    guarantees **recoverability**, not atomicity.
  - Making this airtight would need a cross-tab lock (for example the Web
    Locks API) or a different storage engine. Neither is part of M1.
- If the browser itself loses or corrupts a write in a way that is not
  reported, nothing in the app can detect it beyond the read-back check.
- Malformed **settings** fall back to defaults and may be overwritten on
  the next settings save. Settings hold no financial data.
- Unreadable data can be downloaded and set aside, but the app does not
  try to repair it automatically.
- The frozen `vanilla/db.js` keeps its original course behavior and the
  `cost-manager:` keys. The app does not use it.
