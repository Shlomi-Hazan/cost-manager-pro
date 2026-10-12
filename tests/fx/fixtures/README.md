# Frozen ECB / Frankfurter v2 fixtures

Real responses from `https://api.frankfurter.dev/v2/providers/ecb/...`,
captured on 2026-10-12 and trimmed only where noted. They let the FX tests run
without any network access (live calls are never part of CI).

| File | Request it came from |
|---|---|
| `ecb-metadata.json` | `GET /v2/providers/ecb` |
| `ecb-latest-2026-10-09.json` | `GET /v2/providers/ecb/rates?quotes=USD,ILS,GBP` (newest observation: Friday 2026-10-09) |
| `ecb-series-2026-09-01_to_2026-10-12.json` | `rates?from=2026-09-01&to=2026-10-12&quotes=USD,ILS,GBP` |
| `ecb-on-2026-10-10-saturday.json` | `rates?date=2026-10-10&quotes=USD,ILS,GBP` (a Saturday: answered with the 2026-10-09 observation) |
| `ecb-on-2025-12-25-usd.json` | `rates?date=2025-12-25&quotes=USD` (a TARGET holiday: answered with 2025-12-24) |
| `ecb-on-1999-01-04-no-ils.json` | `rates?date=1999-01-04&quotes=USD,ILS,GBP` (first ECB date: ILS absent) |
| `ecb-error-422.json` | `rates?quotes=ABC` (HTTP 422) |
| `ecb-empty.json` | the provider's answer for a future or pre-1999 date (`[]` with HTTP 200) |
| `ecb-series-2025-12-18_to_2025-12-31.json` | the 2025 series, sliced (Christmas gap) |
| `ecb-series-2025-04-14_to_2025-04-25.json` | the 2025 series, sliced (Easter gap) |

The rates are published by the European Central Bank for information
purposes only.
