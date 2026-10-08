# Cost Manager Pro — Product Vision

> **Know your money. Feel in control.**

**Status:** Approved (M0). This document describes where the product is
going. For what exists today, see [`REQUIREMENTS.md`](REQUIREMENTS.md).

## 1. The problem

People spend money in more than one currency, in small amounts, across many
categories. Most never get a clear picture of where it goes. Spreadsheets
take effort to keep up. Many finance apps ask for bank logins, upload your
data to their servers, or bury the answer under dashboards full of
advertising.

Cost Manager Pro is a calm, trustworthy place to record expenses and
understand them. Your data stays on your device unless you choose otherwise.

## 2. Target users

- **Everyday individuals** who want to see monthly spending without
  connecting a bank account.
- **Multi-currency spenders**, such as people who travel, work across
  borders, or live in Israel and pay in ILS, USD, and other currencies.
- **Privacy-conscious users** who prefer local-first tools.
- **Bilingual users** who work in English and Hebrew.

The product is for a single person managing their own expenses. Shared or
household finances are not in the initial scope.

## 3. Core user journeys

1. **Record an expense in seconds.** Amount, currency, category,
   description, and date, on a phone or a desktop.
2. **See where I stand this month.** Total spent, comparison with last
   month, top categories, recent expenses.
3. **Find and fix an entry.** Search, filter, sort, edit, delete.
4. **Stay within a budget.** Set monthly and category budgets and see
   progress.
5. **Understand patterns.** Clear reports and charts by month, category, and
   year, in the currency I choose.
6. **Keep my data safe.** Back up, restore, and export my data, and never
   lose it silently.
7. **Use it in my language.** English or Hebrew, with correct
   right-to-left layout.

## 4. Product principles

1. **Clarity First.** Every screen answers one question well. Plain
   language, honest numbers.
2. **Effortless Expense Tracking.** Adding an expense is the fastest action
   in the app.
3. **Meaningful Financial Insights.** Show what helps a decision. Skip
   charts that only decorate.
4. **Financial Correctness and Reliability.** Money, currencies, dates, and
   stored data are high-risk. Never invent values, never round silently,
   never lose data.
5. **Privacy by Design.** Local-first by default. No tracking, no data
   leaving the device without the user's explicit action.
6. **Premium, Accessible User Experience.** Consistent visual language,
   fully usable by keyboard and screen reader, polished on every screen size.
7. **Maintainable Engineering.** Simple designs, testable logic, few
   dependencies, documented decisions.
8. **Incremental Development.** Small, reviewable, verified steps. Each
   milestone leaves the product working.

## 5. Platform and language commitments

- **Desktop and mobile have equal priority.** Neither is secondary
  ([ADR-039](DECISIONS.md#adr-039--desktop-and-mobile-have-equal-priority)).
- **English (`en`) and Hebrew (`he`) are both required in v1**, including a
  full right-to-left layout
  ([ADR-038](DECISIONS.md#adr-038--english-and-hebrew-are-both-required-in-v1)).
  The full contract is in [`LOCALIZATION.md`](LOCALIZATION.md).

## 6. Initial product boundaries

Cost Manager Pro starts **local-first and expenses-only**
([ADR-041](DECISIONS.md#adr-041--local-first-initial-scope)).

Not in the initial scope (not banned forever; each would need its own
decision):

- user accounts or authentication
- cloud sync or a backend
- bank or card integrations
- income, assets, or net-worth tracking

The app must not be described as a bank-account, net-worth, or
"complete finance" tracker while it only manages expenses.

## 7. Long-term opportunities

These are ideas, not commitments. They are not scheduled.

- Recurring expenses and subscription tracking
- CSV import from bank or card statements
- Installable PWA with offline support
- More currencies and a user-chosen base currency
- Optional encrypted sync between devices
- Income tracking and savings goals
- More locales beyond English and Hebrew

## 8. Origin

Cost Manager Pro is an independent continuation of **Cost Manager
Front-End**. Shlomi Hazan and Eldad Simanian built that project together as
a university project. Shlomi Hazan leads the independent development that
followed. The original course materials are kept in
[`archive/course/`](archive/course/README.md).
