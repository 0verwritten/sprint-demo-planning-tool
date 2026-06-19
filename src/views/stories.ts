import { WorkItem } from '../ado.js';

const stateColor: Record<string, string> = {
  Done: 'bg-green-100 text-green-800',
  Tested: 'bg-blue-100 text-blue-800',
  Committed: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-purple-100 text-purple-800',
};

export function storiesPageView(items: WorkItem[]): string {
  if (!items.length) return '<div class="text-gray-500">No stories found for demo planning.</div>';

  // Group by sprint
  const groups = new Map<number, WorkItem[]>();
  for (const item of items) {
    if (!groups.has(item.sprintNumber)) groups.set(item.sprintNumber, []);
    groups.get(item.sprintNumber)!.push(item);
  }

  const sortedSprints = [...groups.keys()].sort((a, b) => a - b);

  let html = `
    <form action="/finalize" method="POST">
      <div class="flex gap-3 mb-4 sticky top-0 bg-gray-50 py-2 z-10 border-b">
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Finalize & Export Excel
        </button>
        <button type="submit" formaction="/export-only" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
          Export Only (no tag changes)
        </button>
        <span class="text-sm text-gray-500 self-center">${items.length} items across ${sortedSprints.length} sprints</span>
      </div>
      <div class="space-y-3">`;

  for (const sprintNum of sortedSprints) {
    const list = groups.get(sprintNum)!;
    html += `
        <details class="border rounded" open>
          <summary class="px-4 py-2 bg-gray-100 font-medium cursor-pointer hover:bg-gray-200 select-none">
            Sprint ${sprintNum} <span class="text-sm text-gray-500 font-normal">(${list.length} items)</span>
          </summary>
          <div class="px-4 py-2 space-y-1">`;

    for (const item of list) {
      const isDemo = item.tags.includes('demo');
      const checked = '';  // never pre-check; demo items shown as grayed only
      const badge = stateColor[item.state] || 'bg-gray-100 text-gray-800';
      const typeBadge = item.type === 'Bug' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700';
      const rowClass = isDemo ? 'opacity-50' : '';

      html += `
            <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer ${rowClass}">
              <input type="checkbox" name="selected" value="${item.id}"
                class="w-4 h-4 rounded border-gray-300">
              <span class="text-xs px-1.5 py-0.5 rounded font-medium ${typeBadge}">${item.type === 'Bug' ? 'Bug' : 'Story'}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium ${badge}">${item.state}</span>
              <a href="${item.url}" target="_blank" class="text-blue-600 hover:underline flex-1 truncate"
                onclick="event.stopPropagation()">
                ${item.id}: ${escapeHtml(item.title)}
              </a>
              ${isDemo ? '<span class="text-xs text-gray-400 italic shrink-0">demoed</span>' : ''}
              <span class="text-xs text-gray-500 shrink-0">${escapeHtml(item.developer || item.assignedTo)}</span>
            </label>`;
    }

    html += `
          </div>
        </details>`;
  }

  html += `
      </div>
    </form>`;
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
