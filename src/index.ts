import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getStoriesForDemo, addDemoTag, removeDemoTag, WorkItem } from './ado.js';
import { exportToExcel } from './excel.js';
import { layout } from './views/layout.js';
import { storiesPageView } from './views/stories.js';

const app = new Hono();

let cachedItems: WorkItem[] = [];

// Main page: load all relevant stories in one shot
app.get('/', async (c) => {
  try {
    cachedItems = await getStoriesForDemo();
    return c.html(layout(storiesPageView(cachedItems)));
  } catch (e: any) {
    return c.html(layout(`<div class="p-4 bg-red-50 border border-red-200 rounded"><p class="text-red-800 font-medium">Error:</p><pre class="mt-2 text-sm text-red-700 whitespace-pre-wrap">${e.message}</pre></div>`), 500);
  }
});

// Finalize: update tags and export Excel
app.post('/finalize', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const raw = body['selected'];
    const selectedIds: number[] = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map(id => parseInt(id as string));

    // Remove demo tag from previously tagged items not in selection
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
  } catch (e: any) {
    return c.html(`<div class="p-4 bg-red-50 border border-red-200 rounded text-red-800">${e.message}</div>`, 500);
  }
});

// Export only: generate Excel without modifying tags
app.post('/export-only', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const raw = body['selected'];
    const selectedIds: number[] = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map(id => parseInt(id as string));

    const selected = cachedItems.filter(i => selectedIds.includes(i.id));
    const buffer = await exportToExcel(selected);

    return c.newResponse(buffer, 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="demo-plan.xlsx"',
    });
  } catch (e: any) {
    return c.html(`<div class="p-4 bg-red-50 border border-red-200 rounded text-red-800">${e.message}</div>`, 500);
  }
});

const port = 3000;
console.log(`Sprint Demo Planner running at http://localhost:${port}`);
serve({ fetch: app.fetch, port });
