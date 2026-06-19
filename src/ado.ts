import 'dotenv/config';

const ORG = process.env.ADO_ORG!;
const PROJECT = process.env.ADO_PROJECT!;
const PAT = process.env.ADO_PAT!;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${Buffer.from(':' + PAT).toString('base64')}`,
};

const api = (path: string) => `${ORG}/${PROJECT}/_apis/${path}`;

async function adoFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts?.headers } });
  if (!res.ok) throw new Error(`ADO API ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface WorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  tags: string[];
  sprint: string;
  sprintNumber: number;
  boardPriority: number;
  assignedTo: string;
  developer: string;
  url: string;
}

// Query stories and bugs under TecOrder\Returns, from the sprint that has "demo" tagged items onward
export async function getStories(): Promise<WorkItem[]> {
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER 'TecOrder\\Returns'
      AND [System.IterationPath] UNDER 'TecOrder\\Returns'
    ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC
  `;

  const result = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const ids: number[] = result.workItems.map((w: { id: number }) => w.id);
  if (!ids.length) return [];

  const items = await getWorkItemsBatch(ids);
  const allItems = await Promise.all(items.map(parseWorkItem));

  // Find lowest sprint that has "demo" tag
  const demoSprints = allItems.filter(i => i.tags.includes('demo')).map(i => i.sprintNumber);
  const minDemoSprint = demoSprints.length ? Math.min(...demoSprints) : 0;

  return allItems
    .filter(i => i.sprintNumber >= minDemoSprint)
    .sort((a, b) => a.sprintNumber - b.sprintNumber || a.boardPriority - b.boardPriority);
}

async function getWorkItemsBatch(ids: number[]) {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  const results = [];
  for (const chunk of chunks) {
    const data = await adoFetch(api('wit/workitemsbatch?api-version=7.1'), {
      method: 'POST',
      body: JSON.stringify({
        ids: chunk,
        fields: [
          'System.Id', 'System.Title', 'System.WorkItemType',
          'System.State', 'System.Tags', 'System.IterationPath',
          'Microsoft.VSTS.Common.BacklogPriority', 'System.AssignedTo',
        ],
        $expand: 'relations',
      }),
    });
    results.push(...data.value);
  }
  return results;
}

async function parseWorkItem(raw: any): Promise<WorkItem> {
  const fields = raw.fields;
  const iterPath: string = fields['System.IterationPath'] || '';
  const sprintMatch = iterPath.match(/Sprint-(\d+)/i);
  const tags = (fields['System.Tags'] || '').split(';').map((t: string) => t.trim().toLowerCase()).filter(Boolean);

  return {
    id: raw.id,
    title: fields['System.Title'],
    type: fields['System.WorkItemType'],
    state: fields['System.State'],
    tags,
    sprint: iterPath,
    sprintNumber: sprintMatch ? parseInt(sprintMatch[1]) : 0,
    boardPriority: fields['Microsoft.VSTS.Common.BacklogPriority'] || 999999,
    assignedTo: fields['System.AssignedTo']?.displayName || '',
    developer: '', // resolved later via subtasks
    url: `${ORG}/${PROJECT}/_workitems/edit/${raw.id}`,
  };
}

// Get developer from subtasks (type Task, look for bug fix / tech design activity)
export async function resolveDeveloper(item: WorkItem, relations: any[]): Promise<string> {
  const childLinks = (relations || []).filter(
    (r: any) => r.rel === 'System.LinkTypes.Hierarchy-Forward'
  );
  if (!childLinks.length) return item.assignedTo;

  const childIds = childLinks.map((r: any) => {
    const parts = r.url.split('/');
    return parseInt(parts[parts.length - 1]);
  });

  const children = await getWorkItemsBatch(childIds);
  const tasks = children.filter((c: any) => c.fields['System.WorkItemType'] === 'Task');

  // Prefer tasks with development-related activity
  for (const task of tasks) {
    const activity: string = (task.fields['Microsoft.VSTS.Common.Activity'] || '').toLowerCase();
    if (activity === 'development' || activity === 'design') {
      return task.fields['System.AssignedTo']?.displayName || '';
    }
  }

  // Fallback: any task's assigned to
  for (const task of tasks) {
    if (task.fields['System.AssignedTo']?.displayName) {
      return task.fields['System.AssignedTo'].displayName;
    }
  }

  return item.assignedTo;
}

// Get full work items with relations to resolve developers
export async function getStoriesWithDevelopers(): Promise<WorkItem[]> {
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER 'TecOrder\\Returns'
      AND [System.IterationPath] UNDER 'TecOrder\\Returns'
    ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC
  `;

  const result = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const ids: number[] = result.workItems.map((w: { id: number }) => w.id);
  if (!ids.length) return [];

  const items = await getWorkItemsBatch(ids);
  const allItems: WorkItem[] = [];

  for (const raw of items) {
    const item = await parseWorkItem(raw);
    item.developer = await resolveDeveloper(item, raw.relations || []);
    allItems.push(item);
  }

  const demoSprints = allItems.filter(i => i.tags.includes('demo')).map(i => i.sprintNumber);
  const minDemoSprint = demoSprints.length ? Math.min(...demoSprints) : 0;

  return allItems
    .filter(i => i.sprintNumber >= minDemoSprint)
    .sort((a, b) => a.sprintNumber - b.sprintNumber || a.boardPriority - b.boardPriority);
}

// Add "demo" tag to items
export async function addDemoTag(ids: number[]): Promise<void> {
  for (const id of ids) {
    await adoFetch(api(`wit/workitems/${id}?api-version=7.1`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([{
        op: 'add',
        path: '/fields/System.Tags',
        value: await getTagsWithDemo(id),
      }]),
    });
  }
}

// Remove "demo" tag from items
export async function removeDemoTag(ids: number[]): Promise<void> {
  for (const id of ids) {
    await adoFetch(api(`wit/workitems/${id}?api-version=7.1`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([{
        op: 'add',
        path: '/fields/System.Tags',
        value: await getTagsWithoutDemo(id),
      }]),
    });
  }
}

async function getTagsWithDemo(id: number): Promise<string> {
  const data = await adoFetch(api(`wit/workitems/${id}?fields=System.Tags&api-version=7.1`));
  const existing: string = data.fields['System.Tags'] || '';
  const tags = existing.split(';').map(t => t.trim()).filter(Boolean);
  if (!tags.some(t => t.toLowerCase() === 'demo')) tags.push('demo');
  return tags.join('; ');
}

async function getTagsWithoutDemo(id: number): Promise<string> {
  const data = await adoFetch(api(`wit/workitems/${id}?fields=System.Tags&api-version=7.1`));
  const existing: string = data.fields['System.Tags'] || '';
  return existing.split(';').map(t => t.trim()).filter(t => t.toLowerCase() !== 'demo').join('; ');
}
