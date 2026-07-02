# Sprint Demo Planner

A local web app that automates sprint demo review planning against Azure DevOps. It loads User Stories and Bugs, displays them sprint-by-sprint, lets you check off items to demo, then applies/removes `demo` tags in ADO and exports an Excel file sorted by responsible person.

## Features

- Loads work items from Azure DevOps (User Stories & Bugs)
- Groups items by sprint, sorted by board order
- Interactive UI for selecting items to demo
- Applies/removes `demo` tags in ADO on finalize
- Exports selected items to Excel (.xlsx), sorted by responsible person

## Tech Stack

- **Hono** — lightweight web framework (server-rendered HTML)
- **htmx** — interactive UI without a JS build step
- **Tailwind CSS** (CDN) — styling
- **ExcelJS** — Excel export
- **Azure DevOps REST API** — work item queries and tag management

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Azure DevOps PAT with work item read/write access

### Setup

```bash
cp .env.example .env
# Fill in ADO_ORG, ADO_PROJECT, ADO_PAT
pnpm install
```

### Development

```bash
pnpm dev
```

### Build & Run

```bash
pnpm build
pnpm start
```

### Tests

```bash
pnpm test
```

## License

[MIT](LICENSE) — Vlad Moiseienko
