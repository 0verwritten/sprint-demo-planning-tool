import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import ExcelJS from 'exceljs';
import { WorkItem } from '../src/ado.js';

// Mock the ADO module so no real API calls are made
vi.mock('../src/ado.js', () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: 'Already tagged story',
      type: 'User Story',
      state: 'Active',
      tags: ['demo'],
      sprint: 'TecOrder\\Returns\\Sprint 10',
      sprintNumber: 10,
      boardPriority: 1,
      assignedTo: 'Alice',
      developer: 'Dev Alice',
      url: 'https://dev.azure.com/org/project/_workitems/edit/101',
    },
    {
      id: 102,
      title: 'New story to tag',
      type: 'User Story',
      state: 'Active',
      tags: [],
      sprint: 'TecOrder\\Returns\\Sprint 11',
      sprintNumber: 11,
      boardPriority: 2,
      assignedTo: 'Bob',
      developer: 'Dev Bob',
      url: 'https://dev.azure.com/org/project/_workitems/edit/102',
    },
    {
      id: 103,
      title: 'Another story',
      type: 'Bug',
      state: 'Active',
      tags: ['demo'],
      sprint: 'TecOrder\\Returns\\Sprint 10',
      sprintNumber: 10,
      boardPriority: 3,
      assignedTo: 'Charlie',
      developer: '',
      url: 'https://dev.azure.com/org/project/_workitems/edit/103',
    },
  ];

  return {
    getStoriesForDemo: vi.fn().mockResolvedValue(items),
    addDemoTag: vi.fn().mockResolvedValue(undefined),
    removeDemoTag: vi.fn().mockResolvedValue(undefined),
    WorkItem: {},
  };
});

// Import after mocking
import { getStoriesForDemo, addDemoTag, removeDemoTag } from '../src/ado.js';
import { exportToExcel } from '../src/excel.js';

// Recreate the app logic with the mocked dependencies (same as src/index.ts)
function createApp() {
  const app = new Hono();
  let cachedItems: WorkItem[] = [];

  app.get('/', async (c) => {
    cachedItems = (await getStoriesForDemo()) as WorkItem[];
    return c.text('ok');
  });

  app.post('/finalize', async (c) => {
    const body = await c.req.parseBody({ all: true });
    const raw = body['selected'];
    const selectedIds: number[] = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map(id => parseInt(id as string));

    const previouslyTagged = cachedItems.filter(i => i.tags.includes('demo')).map(i => i.id);
    const toRemove = previouslyTagged.filter(id => !selectedIds.includes(id));
    const toAdd = selectedIds.filter(id => !previouslyTagged.includes(id));

    if (toRemove.length) await (removeDemoTag as any)(toRemove);
    if (toAdd.length) await (addDemoTag as any)(toAdd);

    const selected = cachedItems.filter(i => selectedIds.includes(i.id));
    const buffer = await exportToExcel(selected);

    return c.newResponse(buffer, 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="demo-plan.xlsx"',
    });
  });

  app.post('/export-only', async (c) => {
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
  });

  return app;
}

describe('/finalize route', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp();
    // Populate cachedItems by hitting GET /
    await app.request('/');
  });

  it('adds demo tag to newly selected items', async () => {
    const formData = new FormData();
    formData.append('selected', '101'); // already tagged
    formData.append('selected', '102'); // newly selected

    const res = await app.request('/finalize', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    expect(addDemoTag).toHaveBeenCalledWith([102]);
  });

  it('removes demo tag from deselected items', async () => {
    // Only select 101, leaving 103 (previously tagged) deselected
    const formData = new FormData();
    formData.append('selected', '101');

    const res = await app.request('/finalize', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    expect(removeDemoTag).toHaveBeenCalledWith([103]);
  });

  it('does not call addDemoTag when all selected were already tagged', async () => {
    const formData = new FormData();
    formData.append('selected', '101');
    formData.append('selected', '103');

    const res = await app.request('/finalize', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    expect(addDemoTag).not.toHaveBeenCalled();
    expect(removeDemoTag).not.toHaveBeenCalled();
  });

  it('returns a valid Excel file with selected items', async () => {
    const formData = new FormData();
    formData.append('selected', '101');
    formData.append('selected', '102');

    const res = await app.request('/finalize', { method: 'POST', body: formData });

    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers.get('content-disposition')).toContain('demo-plan.xlsx');

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(arrayBuf));
    const ws = wb.getWorksheet('Demo Plan')!;

    // Should have header + 2 data rows
    expect(ws.rowCount).toBe(3);
  });

  it('handles empty selection gracefully', async () => {
    const formData = new FormData();
    // no selected items

    const res = await app.request('/finalize', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    // Should remove tags from all previously tagged items
    expect(removeDemoTag).toHaveBeenCalledWith([101, 103]);
    expect(addDemoTag).not.toHaveBeenCalled();
  });
});

describe('/export-only route', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp();
    await app.request('/');
  });

  it('returns Excel without modifying tags', async () => {
    const formData = new FormData();
    formData.append('selected', '102');

    const res = await app.request('/export-only', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    expect(addDemoTag).not.toHaveBeenCalled();
    expect(removeDemoTag).not.toHaveBeenCalled();

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(arrayBuf));
    const ws = wb.getWorksheet('Demo Plan')!;
    expect(ws.getRow(2).getCell(1).value).toBe('New story to tag');
  });
});
