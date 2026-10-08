# Cost Manager Pro — Localization Contract (English and Hebrew)

**Status:** Approved requirement (ADR-038). **Not implemented yet.**

Today the UI is English only and left-to-right only. M0 only documents this
contract. Implementation is planned for M2 (formatting) and M3 (translated
UI, RTL, and language switching); see [`ROADMAP.md`](ROADMAP.md).

## 1. Locales

| Code | Language | Direction |
|---|---|---|
| `en` | English | LTR |
| `he` | Hebrew | RTL |

Both are required in v1, at the same level of quality. Neither language may
ship with missing strings, layout bugs, or untested screens.

## 2. Language preference

- **Default on first visit:** use the browser language when it is `he` or
  `en`; otherwise use `en`.
- **Persistence:** the user's choice is stored on the device with the other
  settings and is applied before the first screen appears, so there is no
  flash of the wrong language or direction.
- **Document attributes:** `<html lang>` and `<html dir>` always match the
  active language.
- **Switching:** the language switch is visible in the app shell on both
  desktop and mobile (not hidden in Settings only). It has an accessible
  name, and each option is labeled in its own language ("English", "עברית").
  Switching takes effect immediately, without a reload and without losing
  form input.

## 3. Strings

- No user-facing text is hard-coded in components; every string comes from
  a translation catalog.
- Each language has its own catalog with the same keys. A missing key fails
  a test or check; it never shows a raw key to the user.
- Use plural rules and placeholders. Never build sentences by joining
  strings together.
- Translations are written for meaning, not word-for-word, using consistent
  terms (keep a short glossary of finance terms).
- **Data is not translated.** Descriptions and custom category names stay
  exactly as the user typed them. Suggested category names may be
  translated.

## 4. Dates

- Format with `Intl.DateTimeFormat` for the active language. No hand-made
  `dd/mm/yyyy` strings in the UI.
- Month and weekday names come from `Intl` for the active language.
- Stored dates stay independent of language. A change of language never
  changes stored data.
- The rules for which calendar day an expense falls on (time zones) are
  defined in M2. Formatting must not shift that day.

## 5. Numbers and money

- Format with `Intl.NumberFormat` for the active language, with currency
  style and the rounding policy defined in M2.
- Currency is shown according to the language's own conventions (symbol or
  code, and its position). The stored currency code never changes.
- Calculations never use formatted strings. Formatting happens only at the
  display edge.
- Amount fields accept the decimal separator a user expects for the active
  language and are validated with the same rules in both languages.
- Lists of amounts use tabular (equal-width) digits so columns line up.

## 6. Right-to-left layout

- Direction is set once, at the document root and in the theme (for
  example, MUI's RTL support). Components do not set direction one by one.
- Use **logical CSS properties** (`margin-inline-start`,
  `padding-inline-end`, `inset-inline-start`, `text-align: start`) instead of
  `left`/`right`. Physical properties are allowed only when a comment
  explains why.
- Icons that show direction (back, forward, chevrons, arrows) are mirrored
  in RTL. Icons that don't show direction (plus, trash, settings,
  currency symbols) are not mirrored.
- Navigation order, drawers, dialogs, tables, menus, and text-field adornments
  all follow the active direction.
- Charts: axis order, legends, and tooltips are checked in RTL. A time axis
  (January to December) may stay in its normal order if that is clearer;
  the choice is documented in M3.

## 7. Mixed-direction (bidirectional) text

Hebrew screens often show numbers, currency codes, and English text, and
users may type either language in any field.

- Wrap user-entered text (descriptions, categories) in direction isolation
  (`dir="auto"` or `<bdi>`), so a Hebrew description inside an English
  screen, or an English one inside a Hebrew screen, displays correctly.
- Isolate money values (amount plus currency) as a unit so the sign,
  digits, and currency never get reordered. For example, a Hebrew sentence
  containing `-1,234.50 ₪` or `USD 20` must keep the amount intact.
- Negative numbers, percentages, and date ranges must keep their correct
  meaning in both directions.
- Exported files keep the same text the user typed (see §9).

## 8. Forms and validation

- Labels, helper text, placeholders, and validation messages are
  translated.
- Error messages are linked to their fields for screen readers, in both
  languages.
- Validation rules are the same in both languages; only the wording
  changes.

## 9. Charts, tooltips, and exports

- Chart labels, legends, tooltips, and axis ticks use formatting for the
  active language.
- Text alternatives for charts (titles, labels, data tables) are translated.
- Exported files (Excel, PDF):
  - Headings and labels follow the active language at the time of export.
  - User data is exported exactly as typed.
  - PDF output must display Hebrew correctly (needs a Unicode font and RTL
    text). This is **not verified today** and must be tested before Hebrew
    export is claimed to work.
  - File names stay ASCII-safe.

## 10. Accessibility

- `lang` is correct on the document and on any embedded text in the other
  language.
- Screen reader checks are done in both languages: VoiceOver (macOS/iOS) at
  minimum, NVDA where available.
- Focus order follows the visual order in both directions.

## 11. Testing (required for every UI change once localization exists)

- Automated tests for both languages:
  - formatting of dates, numbers, and money
  - catalogs have the same keys
  - the active language sets `<html lang>` and `<html dir>`
- Component tests render key screens in both `en` and `he`.
- End-to-end smoke test (M7) runs the main journeys in both languages.
- Manual browser check of every meaningful UI change in **both directions**,
  at **desktop and mobile widths**, before the change is called done.

## 12. Library choice

**No i18n library is chosen yet.** Candidates include `Intl` APIs with a
small in-house catalog, `react-intl` (FormatJS), and `i18next` with
`react-i18next`. The choice must be recorded in an ADR in M3, compared on:

- bundle size
- support for plurals and placeholders (ICU message format)
- how well it fits with MUI and its RTL support
- testability
- how simple the code stays
