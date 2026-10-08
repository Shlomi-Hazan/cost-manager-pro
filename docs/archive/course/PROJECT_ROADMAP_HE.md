# Cost Manager Front-End — תכנית Milestones מלאה

> מסמך עבודה לפרויקט הגמר בקורס **פיתוח צד לקוח**.  
> מטרת המסמך היא לנהל את הפרויקט מתחילתו ועד ההגשה, עם חלוקה ברורה ל־Milestones, עבודה מסודרת עם Git/GitHub, שימוש ב־Codex וב־Claude Code, בדיקות, תיעוד ו־Deployment.

---

## 1. מטרת הפרויקט

פיתוח אפליקציית **Cost Manager** בצד הלקוח, בהתאם למסמך הדרישות הרשמי של הקורס.

האפליקציה תאפשר:

- הוספת הוצאות חדשות.
- שמירת הנתונים ב־`localStorage`.
- הפקת דוח מפורט לפי חודש ושנה.
- בחירת מטבע לדוחות ולגרפים.
- הצגת Pie Chart לפי קטגוריות.
- הצגת Bar Chart שנתי עבור 12 חודשים.
- משיכת שערי חליפין באמצעות `Fetch API`.
- שימוש בכתובת ברירת מחדל לשערי חליפין.
- אפשרות להגדיר כתובת חלופית דרך מסך Settings.
- עבודה עם המטבעות:
  - `USD`
  - `ILS`
  - `GBP`
  - `EURO`
- שתי גרסאות של `db.js`:
  - גרסת Module לשימוש בפרויקט.
  - גרסת Vanilla עצמאית לבדיקת המרצה.
- Deployment של הפרויקט לשרת Web.
- תאימות ל־Google Chrome בגרסה העדכנית.

---

# 2. עקרונות עבודה לאורך כל הפרויקט

## Git / GitHub

ה־repository ישמש כ־Source of Truth של הפרויקט.

כל שינוי משמעותי יעבור את התהליך הבא:

```text
Requirement
    ↓
GitHub Issue
    ↓
Feature Branch
    ↓
Implementation
    ↓
Tests / Lint / Build
    ↓
Pull Request
    ↓
Review
    ↓
Merge to main
```

אין לבצע פיתוח ישירות על `main`.

דוגמאות לשמות branches:

```text
docs/project-foundation
feature/db-library
feature/add-cost
feature/exchange-rates
feature/monthly-report
feature/pie-chart
feature/yearly-bar-chart
feature/settings
test/db-library
chore/deployment
```

---

## עבודה עם Codex

Codex יהיה כלי הפיתוח המרכזי.

לפני כל משימה עליו לקרוא לפחות:

```text
AGENTS.md
intent.txt
docs/REQUIREMENTS.md
docs/ARCHITECTURE.md
docs/TEST_PLAN.md
```

Codex יקבל משימות מוגדרות ומצומצמות בלבד.

לא:

```text
Build the whole project.
```

אלא:

```text
Implement GitHub Issue #12 only.
Follow AGENTS.md.
Do not modify unrelated files.
Run tests, lint and production build before finishing.
```

---

## עבודה עם Claude Code

Claude Code ישמש בעיקר עבור:

- Code Review.
- בדיקת architecture.
- Debugging.
- Second opinion.
- זיהוי edge cases.
- בדיקת Pull Requests.
- אימות שהמימוש תואם לדרישות.

יש להימנע מכך ש־Codex ו־Claude Code ישנו את אותו branch בו־זמנית.

Workflow מומלץ:

```text
Codex implements
      ↓
Commit
      ↓
Claude reviews
      ↓
Fixes
      ↓
Tests
      ↓
Pull Request
```

---

# 3. מבנה מסמכים מתוכנן

```text
/
├── README.md
├── intent.txt
├── AGENTS.md
├── CLAUDE.md
├── CONTRIBUTING.md
│
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT_ROADMAP_EN.md
│   ├── PROJECT_ROADMAP_HE.md
│   ├── TEST_PLAN.md
│   ├── DECISIONS.md
│   └── SUBMISSION_CHECKLIST.md
│
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── lib/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
│
├── vanilla/
│   ├── db.js
│   └── db-test.html
│
├── tests/
├── public/
├── package.json
└── .gitignore
```

המבנה הסופי יכול להשתנות במהלך הפיתוח, אך אין לשנות דרישות רשמיות או API שהמרצה דורש.

---

# 4. Milestone 0 — Project Foundation

## מטרה

להקים את בסיס הפרויקט לפני כתיבת features.

## משימות

- [ ] לעבור על מסמך הדרישות הרשמי במלואו.
- [ ] להפיק `docs/REQUIREMENTS.md`.
- [ ] לתת ID לכל דרישה, לדוגמה `R-001`.
- [ ] ליצור `intent.txt`.
- [ ] ליצור `AGENTS.md` עבור Codex.
- [ ] ליצור `CLAUDE.md`.
- [ ] ליצור `docs/ARCHITECTURE.md`.
- [ ] ליצור את `docs/PROJECT_ROADMAP_EN.md` ואת `docs/PROJECT_ROADMAP_HE.md`.
- [ ] ליצור `docs/TEST_PLAN.md`.
- [ ] ליצור `docs/SUBMISSION_CHECKLIST.md`.
- [ ] ליצור `.gitignore`.
- [ ] ליצור GitHub repository.
- [ ] להוסיף את חבר הצוות.
- [ ] להגדיר branch ראשי `main`.
- [ ] ליצור GitHub Issues ראשוניים.
- [ ] להגדיר Pull Request template.
- [ ] להחליט על conventions לשמות commits ו־branches.
- [ ] לוודא שה־working tree נקי.

## Definition of Done

- [ ] כל הדרישות הרשמיות מתועדות.
- [ ] ה־repository קיים ב־GitHub.
- [ ] חברי הצוות מחוברים.
- [ ] מסמכי ההנחיות ל־Codex ול־Claude קיימים.
- [ ] אין עדיין feature code לא מבוקר.
- [ ] קיים commit ראשוני נקי.

Commit מומלץ:

```text
chore: initialize Cost Manager project
```

---

# 5. Milestone 1 — Application Skeleton

## מטרה

להקים את שלד האפליקציה ואת סביבת העבודה.

## Stack מומלץ

```text
React
Vite
JavaScript / JSX
MUI
Chart.js
Vitest
ESLint
```

> השימוש ב־React/MUI הוא בחירה ארכיטקטונית. הדרישות מאפשרות גם Vanilla JavaScript.

## משימות

- [ ] יצירת פרויקט Vite.
- [ ] התקנת React.
- [ ] התקנת MUI.
- [ ] התקנת ספריית charts.
- [ ] הגדרת ESLint.
- [ ] הגדרת test runner.
- [ ] יצירת layout בסיסי.
- [ ] יצירת navigation.
- [ ] יצירת pages ריקות:
  - [ ] Dashboard
  - [ ] Add Cost
  - [ ] Monthly Report
  - [ ] Charts
  - [ ] Settings
- [ ] לוודא שה־UI באנגלית.
- [ ] לוודא שהפרויקט רץ ב־Chrome.
- [ ] להריץ build ראשוני.

## Definition of Done

```text
npm install       ✅
npm run dev       ✅
npm run lint      ✅
npm test          ✅
npm run build     ✅
```

---

# 6. Milestone 2 — Core `db.js` Library

## מטרה

לממש את שכבת הנתונים המרכזית של הפרויקט.

זהו אחד ה־Milestones הקריטיים ביותר.

## API חובה

```javascript
db.openCostsDB(databaseName, databaseVersion)
```

הפונקציה מחזירה object המייצג את בסיס הנתונים.

על אותו object להיות מסוגל לספק:

```javascript
ob.addCost(cost)
ob.getReport(currency, year, month)
```

## `openCostsDB`

- [ ] מקבלת `databaseName` מסוג string.
- [ ] מקבלת `databaseVersion` מסוג number.
- [ ] מחזירה database object.
- [ ] משתמשת ב־`localStorage`.

## `addCost`

Input:

```javascript
{
  sum,
  currency,
  category,
  description
}
```

יש לשמור:

- [ ] sum.
- [ ] currency.
- [ ] category.
- [ ] description.
- [ ] תאריך ההוספה.
- [ ] המטבע המקורי.

יש לוודא שהוספת פריט חדש אינה מוחקת פריטים קיימים.

## `getReport`

תומכת ב:

```javascript
ob.getReport("USD", 2026, 8)
```

וגם:

```javascript
ob.getReport("USD")
```

במקרה שבו לא נשלחים חודש ושנה, יש להשתמש בחודש ובשנה הנוכחיים.

## Definition of Done

- [ ] נתונים נשמרים ב־localStorage.
- [ ] refresh לא מוחק נתונים.
- [ ] addCost עובד.
- [ ] getReport עובד.
- [ ] current month/year defaults עובדים.
- [ ] אין תלות ב־UI.

---

# 7. Milestone 3 — Vanilla `db.js`

## מטרה

ליצור את הגרסה העצמאית שהמרצה יוכל לבדוק אוטומטית.

## דרישה חשובה

טעינה באמצעות:

```html
<script src="db.js"></script>
```

חייבת ליצור global property בשם:

```javascript
db
```

ולאפשר:

```javascript
const ob = db.openCostsDB("costsdb", 1);
ob.addCost(...);
ob.getReport("USD");
```

## משימות

- [ ] יצירת `vanilla/db.js`.
- [ ] ללא imports.
- [ ] ללא React.
- [ ] ללא bundler dependency.
- [ ] חשיפת `db` ל־global object.
- [ ] יצירת `vanilla/db-test.html`.
- [ ] הכנסת קוד הבדיקה שסופק במסמך הקורס.
- [ ] בדיקה ב־Chrome.
- [ ] בדיקת Console output.

## Contract שאסור לשבור

```text
db
 └── openCostsDB()
      └── database object
           ├── addCost()
           └── getReport()
```

אין להעביר את `getReport()` ל־`db.getReport()` אם הדבר שובר את החוזה הנדרש.

---

# 8. Milestone 4 — Add Cost Feature

## מטרה

לאפשר למשתמש להוסיף הוצאה חדשה.

## שדות

- [ ] Sum.
- [ ] Currency.
- [ ] Category.
- [ ] Description.

Supported currencies:

```text
USD
ILS
GBP
EURO
```

## התאריך

המשתמש לא צריך להזין תאריך.

התאריך נוצר בזמן ההוספה.

## Validation מומלץ

- [ ] sum הוא מספר.
- [ ] sum גדול מ־0.
- [ ] currency תקין.
- [ ] category לא ריק.
- [ ] description לא ריק.
- [ ] הודעת הצלחה.
- [ ] הודעת שגיאה ברורה.

## Definition of Done

- [ ] ניתן להוסיף הוצאה.
- [ ] ההוצאה מופיעה ב־localStorage.
- [ ] המטבע נשמר.
- [ ] התאריך נשמר.
- [ ] refresh משמר את ההוצאה.

---

# 9. Milestone 5 — Exchange Rates Infrastructure

## מטרה

להוסיף תמיכה בשערי חליפין דרך `Fetch API`.

## JSON נדרש

המערכת צריכה לדעת לעבוד עם JSON במבנה:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

## משימות

- [ ] יצירת JSON של שערים.
- [ ] Deployment שלו לשרת המחובר לאינטרנט.
- [ ] יצירת default exchange-rates URL.
- [ ] מימוש fetch.
- [ ] validation לתגובה.
- [ ] טיפול ב־network error.
- [ ] שמירת rate data רלוונטי אם נדרש.
- [ ] לאפשר לאפליקציה לעבוד גם ללא URL שהוגדר ידנית.

## Conversion Formula

אם rates מתארים ערך של מטבע ביחס ל־USD:

```javascript
convertedAmount =
  amount / rates[sourceCurrency] * rates[targetCurrency];
```

## Tests

- [ ] USD → ILS.
- [ ] ILS → USD.
- [ ] GBP → EURO.
- [ ] USD → USD.
- [ ] invalid currency.
- [ ] malformed rates response.

---

# 10. Milestone 6 — Monthly Report

## מטרה

להפיק דוח מפורט לחודש ולשנה שנבחרו.

## Input

- [ ] Month.
- [ ] Year.
- [ ] Currency.

## Output

- [ ] Year.
- [ ] Month.
- [ ] List of costs.
- [ ] Total.
- [ ] Total currency.

מבנה הדוח צריך להתאים לחוזה שהוגדר בדרישות.

## עיקרון ארכיטקטוני

React/UI לא צריך לחשב מחדש את הדוח.

```text
UI
 ↓
db.js
 ↓
localStorage
```

`db.js` יהיה ה־source of truth ללוגיקה הזו.

## Tests

- [ ] חודש עם הוצאות.
- [ ] חודש ללא הוצאות.
- [ ] מספר מטבעות שונים באותו חודש.
- [ ] current month/year.
- [ ] explicit month/year.
- [ ] total conversion.

---

# 11. Milestone 7 — Pie Chart

## מטרה

להציג הוצאות לפי קטגוריות עבור חודש ושנה.

## Selection

- [ ] Month.
- [ ] Year.
- [ ] Currency.

## Logic

```text
Costs for month
      ↓
Convert to selected currency
      ↓
Group by category
      ↓
Sum
      ↓
Pie Chart
```

## Tests

- [ ] קטגוריה יחידה.
- [ ] מספר קטגוריות.
- [ ] mixed currencies.
- [ ] no costs.
- [ ] currency change updates chart.

---

# 12. Milestone 8 — Yearly Bar Chart

## מטרה

להציג את סך ההוצאות בכל אחד מ־12 חודשי השנה.

## Selection

- [ ] Year.
- [ ] Currency.

## Output

הגרף צריך לכלול תמיד:

```text
Jan
Feb
Mar
Apr
May
Jun
Jul
Aug
Sep
Oct
Nov
Dec
```

גם חודש ללא הוצאות צריך להופיע עם:

```text
0
```

## Tests

- [ ] 12 חודשים תמיד.
- [ ] חודש ללא הוצאות.
- [ ] שנה ללא הוצאות.
- [ ] mixed currencies.
- [ ] currency conversion.
- [ ] year switch.

---

# 13. Milestone 9 — Settings

## מטרה

לאפשר למשתמש להגדיר URL לשערי חליפין.

## Features

- [ ] Exchange Rates URL.
- [ ] Save.
- [ ] Load saved setting.
- [ ] Reset to default.
- [ ] Test URL.
- [ ] הודעה על URL לא תקין.
- [ ] fallback ל־default URL.

## Requirement

גם אם המשתמש מעולם לא פתח Settings, האפליקציה חייבת להיות מסוגלת להביא שערי חליפין דרך כתובת ברירת מחדל.

---

# 13.5. Milestone 9.5 — הרחבות מוצר

## מטרה

להוסיף הרחבות צוותיות אחרי שהפיצ'רים הרשמיים המרכזיים עובדים, בלי לשנות את חוזה
`db.js` שמוגן לצורכי הקורס.

## 9.5A — תשתית נתונים ו־CRUD להוצאות

- GitHub Issue: [#24](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/24)
- יצירת ID יציב לכל הוצאה חדשה.
- שמירת day/month/year/hour/minute להוצאות חדשות של האפליקציה.
- הוספת מתודות CRUD לגרסת המודול ולגרסת Vanilla:
  - `getAllCosts()`
  - `getCostById(id)`
  - `updateCost(id, cost)`
  - `deleteCost(id)`
- העברת namespace של הוצאות האפליקציה לגרסת database 2.
- הוספת Reports navigation עם tabs של Monthly ו־Yearly.
- השארת Yearly Report כ־placeholder בלבד.

## 9.5B — ניהול, עריכה ומחיקת הוצאות

- GitHub Issue: [#25](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/25)
- הוספת אזור Manage Costs לניהול הוצאות שמורות.
- עריכה מלאה של:
  - sum,
  - currency,
  - category,
  - description,
  - date,
  - time.
- מחיקת הוצאות לפי ID יציב.
- הצגת אישור לפני מחיקה.
- שמירה על התנהגות category autocomplete/free-text הקיימת בזמן עריכה.

## 9.5C — דוח שנתי מפורט + שעה בדוחות

- GitHub Issue: [#26](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/26)
- מימוש דוח Yearly Report מפורט.
- בחירת שנה ומטבע.
- הצגת כל שורות הדוח השנתי.
- הצגת total שנתי מומר במטבע שנבחר.
- הוספת הצגת שעה לשורות Monthly Report.
- הוספת תאריך + שעה לשורות Yearly Report.

## 9.5D — מיון דוחות

- GitHub Issue: [#27](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/27)
- הוספת כותרות טבלה לחיצות בדוחות Monthly ו־Yearly.
- תמיכה במיון עולה ויורד.
- הצגת חץ שמראה את כיוון המיון הפעיל.
- מיון Date/Time בסדר כרונולוגי.
- מיון Description, Category ו־Currency לפי סדר אלפביתי.
- מיון Sum לפי ערך מספרי.
- שימוש במימוש sorting משותף לטבלאות הדוחות.

## 9.5E — ייצוא Excel ו־PDF

- GitHub Issue: [#28](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/28)
- ייצוא Monthly Report ל־XLSX.
- ייצוא Monthly Report ל־PDF.
- ייצוא Yearly Report ל־XLSX.
- ייצוא Yearly Report ל־PDF.
- ייצוא נתוני Pie Chart ל־Excel.
- ייצוא Pie Chart visualization/data ל־PDF.
- ייצוא נתוני Bar Chart ל־Excel.
- ייצוא Bar Chart visualization/data ל־PDF.

---

# 14. Milestone 10 — UI/UX Polish

## מטרה

לשפר את הממשק רק לאחר שהדרישות הפונקציונליות עובדות.

## משימות

- [ ] typography.
- [ ] spacing.
- [ ] consistent MUI components.
- [ ] forms.
- [ ] loading states.
- [ ] error states.
- [ ] empty states.
- [ ] chart labels.
- [ ] desktop layout.
- [ ] Chrome compatibility.
- [ ] keyboard usability בסיסי.
- [ ] consistency בין pages.

אין להכניס feature חדש רק לצורך "wow" אם הוא עלול לפגוע בדרישות הקורס.

---

# 15. Milestone 11 — Automated Testing & QA

## מטרה

לבצע בדיקה מלאה של המערכת לפני deployment.

## Unit Tests

- [ ] currency conversion.
- [ ] addCost.
- [ ] getReport.
- [ ] date defaults.
- [ ] grouping by category.
- [ ] yearly aggregation.

## Vanilla DB Test

- [ ] פתיחת `db-test.html`.
- [ ] בדיקה עם הקוד הרשמי.
- [ ] בדיקה ב־Chrome.
- [ ] אין exception.
- [ ] total קיים.
- [ ] addCost מחזיר ערך.

## Manual QA Matrix

| Scenario | Expected |
|---|---|
| Add USD cost | Saved |
| Add GBP cost | Saved with GBP |
| Refresh | Data remains |
| Monthly report | Correct costs |
| Month without costs | Empty/zero result |
| Pie chart | Correct categories |
| Bar chart | 12 months |
| Change currency | Converted values |
| Custom rates URL | Used |
| No custom URL | Default URL used |
| Invalid URL | Graceful error/fallback |
| Latest Chrome | Works |
| Production build | Works |

---

# 16. Milestone 12 — GitHub Actions / CI

## מטרה

לוודא שכל Pull Request נבדק אוטומטית.

Pipeline מומלץ:

```text
Pull Request
    ↓
npm ci
    ↓
npm run lint
    ↓
npm test
    ↓
npm run build
```

## Definition of Done

PR לא מתמזג אם:

```text
lint ❌
tests ❌
build ❌
```

PR מוכן ל־merge כאשר:

```text
lint ✅
tests ✅
build ✅
review ✅
```

---

# 17. Milestone 13 — Deployment

## מטרה

להעלות את הפרויקט לשרת המחובר לאינטרנט.

אפשר להשתמש בשירות כגון Render או שירות Web מתאים אחר.

## משימות

- [ ] production build.
- [ ] חיבור ל־GitHub.
- [ ] deployment.
- [ ] שמירת Production URL.
- [ ] בדיקת refresh.
- [ ] בדיקת routes.
- [ ] בדיקת localStorage.
- [ ] בדיקת Fetch.
- [ ] בדיקת rates server.
- [ ] Smoke Test ב־Google Chrome.

## Production Checklist

```text
Application loads              ✅
Add cost works                 ✅
localStorage works             ✅
Monthly report works           ✅
Pie chart works                ✅
Bar chart works                ✅
Settings URL works             ✅
Default exchange URL works     ✅
No console-blocking errors     ✅
```

---

# 18. Milestone 14 — Documentation & Teamwork Evidence

## מטרה

לוודא שכל תהליך העבודה מתועד.

## GitHub Evidence

יש לשמור:

- [ ] Issues.
- [ ] Branches.
- [ ] Commits.
- [ ] Pull Requests.
- [ ] Reviews.
- [ ] Comments.
- [ ] Assignments.
- [ ] Project board, אם נעשה בו שימוש.

## Collaborative Tools

בהגשה נדרש סיכום קצר של השימוש בלפחות שני collaborative tools.

יש לתעד לאורך הפרויקט:

```text
Tool
Who used it
What it was used for
Examples
```

אין להמתין לסוף הפרויקט כדי לנסות להיזכר.

---

# 19. Milestone 15 — Final Requirement Audit

## מטרה

לעבור על כל דרישה אחת־אחת מול המימוש בפועל.

מבנה מומלץ:

| Requirement | Implementation | Test | Status |
|---|---|---|---|
| R-001 | ... | ... | ✅ |
| R-002 | ... | ... | ✅ |
| R-003 | ... | ... | ✅ |

## Audit Sources

```text
Official requirements
        ↓
REQUIREMENTS.md
        ↓
Repository
        ↓
Tests
        ↓
Production
```

אין לסמן דרישה כ־Done רק משום שקיים קוד שנראה כאילו הוא מממש אותה.

יש לבדוק בפועל.

---

# 20. Milestone 16 — Submission Package

## מטרה

ליצור בדיוק את קבצי ההגשה הנדרשים.

## Moodle Submission

יש להגיש **שלושה קבצים בלבד**:

```text
1. project.zip
2. firstname_lastname.pdf
3. db.js
```

ה־`db.js` שמוגש בנפרד הוא:

```text
Vanilla Version
```

## ZIP

לפני יצירת ZIP:

- [ ] למחוק `node_modules`.
- [ ] לוודא שקוד המקור קיים.
- [ ] לוודא ש־package.json קיים.
- [ ] לוודא שלא קיימים secrets.
- [ ] לוודא שניתן לבצע fresh install.

---

# 21. Milestone 17 — Submission PDF

## מטרה

להכין את PDF הקוד לפי דרישות הקורס.

בתחילת הקובץ:

- [ ] שם פרטי + משפחה של מנהל הצוות.
- [ ] עבור כל חבר צוות:
  - [ ] First Name.
  - [ ] Last Name.
  - [ ] ID.
  - [ ] Mobile Number.
  - [ ] Email Address.
- [ ] קישור לחיץ לסרטון.
- [ ] הערות רלוונטיות, אם יש.
- [ ] סיכום של עד 100 מילים על לפחות שני collaborative tools.

לאחר מכן:

- [ ] שם כל קובץ קוד.
- [ ] הקוד של אותו קובץ.
- [ ] אין שבירת שורות שמפריעה לקריאה.
- [ ] הקובץ מאורגן לבדיקת קוד.

שם הקובץ:

```text
firstname_lastname.pdf
```

באותיות קטנות ועם `_`.

---

# 22. Milestone 18 — Demo Video

## מטרה

להכין סרטון קצר שמראה שהמערכת עובדת.

## דרישות

- [ ] עד כ־60 שניות.
- [ ] Upload ל־YouTube.
- [ ] Visibility: Unlisted.
- [ ] הקישור עובד.
- [ ] הקישור מוכנס ל־PDF.

## Flow מומלץ לסרטון

```text
Open application
      ↓
Add cost
      ↓
Show monthly report
      ↓
Show pie chart
      ↓
Show yearly chart
      ↓
Show settings / currency conversion
```

---

# 23. Milestone 19 — Final Submission Audit

## מטרה

הבדיקה האחרונה לפני Moodle.

### Repository

- [ ] `main` נקי.
- [ ] כל PR רלוונטי merged.
- [ ] אין uncommitted changes.
- [ ] tests pass.
- [ ] lint passes.
- [ ] build passes.

### Vanilla `db.js`

- [ ] standalone.
- [ ] global `db`.
- [ ] official sample test passes.
- [ ] `ob.addCost()`.
- [ ] `ob.getReport()`.

### Production

- [ ] URL עובד.
- [ ] Chrome עובד.
- [ ] Fetch עובד.
- [ ] default rates עובדים.
- [ ] custom rates URL עובד.

### Submission

- [ ] ZIP.
- [ ] PDF.
- [ ] Vanilla `db.js`.
- [ ] בדיוק 3 קבצים.
- [ ] YouTube link בתוך PDF.
- [ ] אין `node_modules`.
- [ ] שמות הקבצים נכונים.

---

# 24. Milestone 20 — Submit

## לפני הלחיצה על Submit

- [ ] לבצע הורדה חוזרת של שלושת קבצי ההגשה ולפתוח אותם.
- [ ] לפתוח את ה־ZIP ולוודא שהוא תקין.
- [ ] לפתוח את ה־PDF ולבדוק קישורים.
- [ ] לפתוח את `db.js`.
- [ ] לוודא שלא נבחרה בטעות גרסת module.
- [ ] לבדוק את Production URL.
- [ ] לבדוק YouTube link.
- [ ] לבצע submission רק מחשבון מנהל הצוות.

יש להתייחס ל־deadline כאילו הוא מוקדם בכ־30 דקות מהשעה המוצגת במערכת, בהתאם להנחיית מסמך הקורס.

---

# 25. Definition of Done לפרויקט כולו

הפרויקט נחשב גמור רק כאשר כל התנאים הבאים מתקיימים:

```text
Official requirements satisfied            ✅
Requirement audit complete                  ✅
Vanilla db.js contract verified             ✅
localStorage verified                       ✅
Exchange-rate fetch verified                ✅
Monthly report verified                     ✅
Pie chart verified                          ✅
12-month bar chart verified                 ✅
Settings URL verified                       ✅
Default exchange-rate URL verified          ✅
Tests pass                                  ✅
Lint passes                                 ✅
Production build passes                     ✅
Chrome production smoke test passes         ✅
Git/GitHub history documented               ✅
Teamwork evidence documented                ✅
Deployment live                             ✅
Video ready                                 ✅
Submission PDF ready                        ✅
ZIP ready without node_modules              ✅
Exactly three Moodle files ready            ✅
```

---

# 26. כלל העבודה המרכזי

בכל שלב:

```text
Requirement
     ↓
Plan
     ↓
Issue
     ↓
Implementation
     ↓
Test
     ↓
Review
     ↓
Merge
     ↓
Audit
```

המטרה אינה רק "שהאתר יעבוד", אלא שהפרויקט יהיה:

- תואם לדרישות.
- ניתן לבדיקה.
- מתועד.
- ניתן לתחזוקה.
- בנוי בצורה מסודרת.
- מגובה בהיסטוריית Git/GitHub ברורה.
- מוכן להגשה ללא תיקונים של הרגע האחרון.
