import ExcelJS from 'exceljs';
import { WorkItem } from './ado.js';

export async function exportToExcel(items: WorkItem[]): Promise<Buffer> {
  // Sort by responsible person (developer)
  const sorted = [...items].sort((a, b) =>
    (a.developer || a.assignedTo).localeCompare(b.developer || b.assignedTo)
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Demo Plan');

  ws.columns = [
    { header: 'Order', key: 'order', width: 8 },
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Title', key: 'title', width: 50 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Sprint', key: 'sprint', width: 15 },
    { header: 'State', key: 'state', width: 12 },
    { header: 'Responsible', key: 'responsible', width: 25 },
  ];

  // Style header
  ws.getRow(1).font = { bold: true };

  for (const item of sorted) {
    ws.addRow({
      order: '',
      id: item.id,
      title: item.title,
      type: item.type,
      sprint: item.sprint.split('\\').pop() || item.sprint,
      state: item.state,
      responsible: item.developer || item.assignedTo,
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
