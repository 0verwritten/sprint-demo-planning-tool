import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportToExcel } from '../src/excel.js';
import { WorkItem } from '../src/ado.js';

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Test Story',
    type: 'User Story',
    state: 'Active',
    tags: [],
    sprint: 'TecOrder\\Returns\\Sprint 10',
    sprintNumber: 10,
    boardPriority: 1,
    assignedTo: 'Alice',
    developer: '',
    url: 'https://dev.azure.com/org/project/_workitems/edit/1',
    ...overrides,
  };
}

describe('exportToExcel', () => {
  it('generates an Excel buffer with correct headers', async () => {
    const items: WorkItem[] = [makeItem()];
    const buffer = await exportToExcel(items);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Demo Plan');
    expect(ws).toBeDefined();

    // Check headers
    const headerRow = ws!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Title');
    expect(headerRow.getCell(2).value).toBe('Assigned To');
    expect(headerRow.getCell(3).value).toBe('Order');
  });

  it('populates rows with item data', async () => {
    const items: WorkItem[] = [
      makeItem({ id: 1, title: 'Story A', assignedTo: 'Alice', developer: 'Bob' }),
      makeItem({ id: 2, title: 'Story B', assignedTo: 'Charlie', developer: '' }),
    ];
    const buffer = await exportToExcel(items);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Demo Plan')!;

    // Row 2 and 3 are data rows (row 1 is header)
    // Items sorted by developer/assignedTo: Bob < Charlie
    const row2 = ws.getRow(2);
    expect(row2.getCell(1).value).toBe('Story A');
    expect(row2.getCell(2).value).toBe('Bob');
    expect(row2.getCell(3).value).toBe('');

    const row3 = ws.getRow(3);
    expect(row3.getCell(1).value).toBe('Story B');
    expect(row3.getCell(2).value).toBe('Charlie');
  });

  it('sorts items by responsible person alphabetically', async () => {
    const items: WorkItem[] = [
      makeItem({ id: 1, title: 'Z-Story', assignedTo: 'Zoe', developer: '' }),
      makeItem({ id: 2, title: 'A-Story', assignedTo: 'Anna', developer: '' }),
      makeItem({ id: 3, title: 'M-Story', assignedTo: 'Mike', developer: '' }),
    ];
    const buffer = await exportToExcel(items);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Demo Plan')!;

    expect(ws.getRow(2).getCell(2).value).toBe('Anna');
    expect(ws.getRow(3).getCell(2).value).toBe('Mike');
    expect(ws.getRow(4).getCell(2).value).toBe('Zoe');
  });

  it('prefers developer over assignedTo', async () => {
    const items: WorkItem[] = [
      makeItem({ id: 1, title: 'Story', assignedTo: 'PO Person', developer: 'Dev Person' }),
    ];
    const buffer = await exportToExcel(items);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Demo Plan')!;

    expect(ws.getRow(2).getCell(2).value).toBe('Dev Person');
  });

  it('returns empty sheet (header only) when no items', async () => {
    const buffer = await exportToExcel([]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Demo Plan')!;

    expect(ws.rowCount).toBe(1); // header only
  });
});
