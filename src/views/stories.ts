import { WorkItem } from '../ado.js';

const stateOrder: Record<string, number> = { Done: 0, Tested: 1, Committed: 2, Approved: 3 };
const stateColor: Record<string, string> = {
  Done: 'bg-green-100 text-green-800',
  Tested: 'bg-blue-100 text-blue-800',
  Committed: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-purple-100 text-purple-800',
};

export function storiesView(items: WorkItem[]): string {
  // Group by sprint
  const groups = new Map<string, WorkItem[]>();
  for (const item of items) {
    const key = item.sprint || 'No Sprint';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // Sort within each group by state priority then board priority
  for (const [, list] of groups) {
    list.sort((a, b) => (stateOrder[a.state] ?? 99) - (stateOrder[b.state] ?? 99) || a.boardPriority - b.boardPriority);
  }

  let html = `
    <form hx-post="/finalize" hx-target="#content" hx-swap="innerHTML">
      <div class="flex gap-3 mb-4">
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Finalize & Export
        </button>
      </div>`;

  for (const [sprint, list] of groups) {
    const sprintLabel = sprint.split('\\').pop() || sprint;
    html += `
      <div class="mb-6">
        <h2 class="text-lg font-semibold border-b pb-1 mb-2">${sprintLabel}</h2>
        <div class="space-y-1">`;

    for (const item of list) {
      const hasDemo = item.tags.includes('demo');
      const checked = hasDemo ? 'checked' : '';
      const badge = stateColor[item.state] || 'bg-gray-100 text-gray-800';
      const typeBadge = item.type === 'Bug' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700';

      html += `
          <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-100 cursor-pointer">
            <input type="checkbox" name="selected" value="${item.id}" ${checked}
              class="w-4 h-4 rounded border-gray-300">
            <span class="text-xs px-1.5 py-0.5 rounded font-medium ${typeBadge}">${item.type === 'Bug' ? 'Bug' : 'Story'}</span>
            <span class="text-xs px-1.5 py-0.5 rounded font-medium ${badge}">${item.state}</span>
            <a href="${item.url}" target="_blank" class="text-blue-600 hover:underline flex-1 truncate">
              ${item.id}: ${escapeHtml(item.title)}
            </a>
            <span class="text-xs text-gray-500">${escapeHtml(item.developer || item.assignedTo)}</span>
          </label>`;
    }

    html += `
        </div>
      </div>`;
  }

  html += '</form>';
  return html;
}

export function resultView(message: string): string {
  return `
    <div class="p-4 bg-green-50 border border-green-200 rounded">
      <p class="text-green-800 font-medium">${message}</p>
      <a href="/" class="text-blue-600 hover:underline mt-2 inline-block">← Back to list</a>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
