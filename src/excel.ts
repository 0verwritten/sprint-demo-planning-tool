import ExcelJS from 'exceljs';
import { WorkItem } from './ado.js';

export async function exportToExcel(items: WorkItem[]): Promise<Buffer> {
  // Sort by responsible person
  const sorted = [...items].sort((a, b) =>
    (a.developer || a.assignedTo).localeCompare(b.developer || b.assignedTo)
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Demo Plan');

  ws.columns = [
    { header: 'Title', key: 'title', width: 60 },
    { header: 'Assigned To', key: 'assignedTo', width: 25 },
    { header: 'Order', key: 'order', width: 8 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const item of sorted) {
    ws.addRow({
      title: item.title,
      assignedTo: item.developer || item.assignedTo,
      order: '',
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
