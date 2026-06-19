import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getStoriesWithDevelopers, addDemoTag, removeDemoTag, WorkItem } from './ado.js';
import { exportToExcel } from './excel.js';
import { layout } from './views/layout.js';
import { storiesView, resultView } from './views/stories.js';

const app = new Hono();

let cachedItems: WorkItem[] = [];

// Main page: list stories grouped by sprint
app.get('/', async (c) => {
  cachedItems = await getStoriesWithDevelopers();
  return c.html(layout(storiesView(cachedItems)));
});

// Finalize: update tags and export Excel
app.post('/finalize', async (c) => {
  const body = await c.req.parseBody();
  const raw = body['selected'];
  const selectedIds: number[] = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map(id => parseInt(id as string));

  // Remove demo tag from previously tagged items
  const previouslyTagged = cachedItems.filter(i => i.tags.includes('demo')).map(i => i.id);
  const toRemove = previouslyTagged.filter(id => !selectedIds.includes(id));
  const toAdd = selectedIds.filter(id => !previouslyTagged.includes(id));

  if (toRemove.length) await removeDemoTag(toRemove);
  if (toAdd.length) await addDemoTag(toAdd);

  // Generate Excel with selected items
  const selected = cachedItems.filter(i => selectedIds.includes(i.id));
  const buffer = await exportToExcel(selected);

  return c.newResponse(buffer, 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="demo-plan.xlsx"',
  });
});

const port = 3000;
console.log(`Sprint Demo Planner running at http://localhost:${port}`);
serve({ fetch: app.fetch, port });
