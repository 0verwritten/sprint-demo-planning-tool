# Sprint Demo Planner — HANDOVER

## What It Does

Local web app that automates sprint demo review planning against Azure DevOps:
1. Loads User Stories & Bugs from `TecOrder\Returns` area
2. Displays them sprint-by-sprint (sorted by board order), starting from the last demo sprint
3. Lets you check off items to demo
4. Applies/removes `demo` tags in ADO and exports an Excel file sorted by responsible person

## Architecture

```
Hono server (Node.js)  →  Azure DevOps REST API (PAT auth)
      ↕
htmx + Tailwind UI (server-rendered HTML)
      ↓
ExcelJS (generates .xlsx on finalize)
```

## File Structure

```
├── src/
│   ├── index.ts           # Hono server, routes: GET /, POST /finalize
│   ├── ado.ts             # ADO API client (WIQL queries, tag management, developer resolution)
│   ├── excel.ts           # Excel export (sorted by responsible person, empty Order column)
│   └── views/
│       ├── layout.ts      # HTML shell (Tailwind CDN + htmx)
│       └── stories.ts     # Sprint-grouped story list with checkboxes
├── build.js               # Compiles TS + packages into single exe via pkg
├── package.json
├── tsconfig.json
├── .env.example           # ADO_ORG, ADO_PROJECT, ADO_PAT
└── .gitignore
```

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Hono + htmx | Zero frontend build, packages cleanly into exe |
| pkg for exe | Bundles Node runtime — no install required on target machine |
| Server-rendered HTML | Tailwind CDN + htmx = interactive UI with no JS build step |
| Developer from subtasks | Looks at child Tasks with Development/Design activity → AssignedTo |
| Board order from ADO | Uses `Microsoft.VSTS.Common.BacklogPriority` field |

## Running

**Dev:**
```
cp .env.example .env    # fill in PAT, org, project
npm install
npm run dev             # http://localhost:3000
```

**Build exe:**
```
npm run build           # outputs exe/sprint-demo-planner.exe
```

**Distribute:** ship `sprint-demo-planner.exe` + `.env` file. Double-click to run.

## ADO Configuration

- **Area path:** `TecOrder\Returns`
- **Iteration pattern:** `TecOrder\Returns\Sprint-{N}`
- **Work item types:** User Story, Bug
- **Tag:** `demo` (lowercase)
- **Developer resolution:** Child work items of type "Task" with Activity = Development or Design → use their AssignedTo

## UI Flow

1. Page loads → stories displayed in sprint sections, sorted by state (Done > Tested > Committed > Approved) then board priority
2. Items previously tagged `demo` are pre-checked
3. User checks/unchecks items for this demo
4. "Finalize & Export" → removes old demo tags, adds new ones, downloads `demo-plan.xlsx`

## Excel Output

| Column | Content |
|--------|---------|
| Order | Empty (filled manually) |
| ID | Work item ID |
| Title | Story/bug title |
| Type | User Story or Bug |
| Sprint | Sprint name |
| State | Done/Tested/Committed/Approved |
| Responsible | Developer (fallback: tester/assigned) |

Sorted by Responsible person so each presenter's items are grouped.
