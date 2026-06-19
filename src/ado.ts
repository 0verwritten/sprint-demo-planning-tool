import 'dotenv/config';

const ORG = process.env.ADO_ORG!;
const PROJECT = process.env.ADO_PROJECT!;
const PAT = process.env.ADO_PAT!;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${Buffer.from(':' + PAT).toString('base64')}`,
};

const baseUrl = ORG.startsWith('http') ? ORG : `https://dev.azure.com/${ORG}`;
const api = (path: string) => `${baseUrl}/${PROJECT}/_apis/${path}`;

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

export interface SprintInfo {
  path: string;
  name: string;
  number: number;
}

// Get list of iterations under TecOrder\Returns
export async function getSprints(): Promise<SprintInfo[]> {
  const data = await adoFetch(api(`wit/classificationnodes/Iterations/Returns?$depth=1&api-version=7.1`));
  const children: any[] = data.children || [];
  const sprints: SprintInfo[] = children
    .filter((c: any) => /^Sprint \d+$/.test(c.name))
    .map((c: any) => {
      const match = c.name.match(/Sprint (\d+)/);
      return { path: `${PROJECT}\\Returns\\${c.name}`, name: c.name, number: match ? parseInt(match[1]) : 0 };
    })
    .sort((a, b) => a.number - b.number);
  return sprints;
}

// Get current iteration
export async function getCurrentIteration(): Promise<string> {
  const data = await adoFetch(api(`work/teamsettings/iterations?$timeframe=current&api-version=7.1`));
  if (data.value && data.value.length) return data.value[0].path;
  return '';
}

// Get stories/bugs for a specific sprint
export async function getStoriesForSprint(sprintPath: string): Promise<WorkItem[]> {
  const areaPath = `${PROJECT}\\Returns`;
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER '${areaPath}'
      AND [System.IterationPath] = '${sprintPath.replace(/'/g, "''")}'
    ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC
  `;

  const result = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const ids: number[] = result.workItems.map((w: { id: number }) => w.id);
  if (!ids.length) return [];

  const items = await getWorkItemsBatch(ids);

  // Collect all child IDs
  const allChildIds: number[] = [];
  for (const raw of items) {
    const childLinks = (raw.relations || []).filter(
      (r: any) => r.rel === 'System.LinkTypes.Hierarchy-Forward'
    );
    for (const link of childLinks) {
      const parts = link.url.split('/');
      allChildIds.push(parseInt(parts[parts.length - 1]));
    }
  }

  // Batch-fetch all children
  const childrenMap = new Map<number, any>();
  if (allChildIds.length) {
    const children = await getWorkItemsBatch(allChildIds);
    for (const child of children) childrenMap.set(child.id, child);
  }

  // Parse and resolve developers
  const allItems: WorkItem[] = [];
  for (const raw of items) {
    const item = parseWorkItem(raw);
    item.developer = resolveDeveloper(item, raw.relations || [], childrenMap);
    allItems.push(item);
  }

  return allItems.sort((a, b) => a.boardPriority - b.boardPriority);
}

// Find which sprints have the "demo" tag (to identify previous demo sprint)
export async function getDemoSprintNumber(): Promise<number> {
  const areaPath = `${PROJECT}\\Returns`;
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER '${areaPath}'
      AND [System.Tags] CONTAINS 'demo'
  `;

  const result = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const ids: number[] = result.workItems.map((w: { id: number }) => w.id);
  if (!ids.length) return 0;

  const items = await getWorkItemsBatch(ids);
  let min = Infinity;
  for (const raw of items) {
    const iterPath: string = raw.fields['System.IterationPath'] || '';
    const match = iterPath.match(/Sprint (\d+)/i);
    if (match) min = Math.min(min, parseInt(match[1]));
  }
  return min === Infinity ? 0 : min;
}

async function getWorkItemsBatch(ids: number[]) {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  const results = [];
  for (const chunk of chunks) {
    const data = await adoFetch(api('wit/workitemsbatch?api-version=7.1'), {
      method: 'POST',
      body: JSON.stringify({ ids: chunk, $expand: 'relations' }),
    });
    results.push(...data.value);
  }
  return results;
}

function parseWorkItem(raw: any): WorkItem {
  const fields = raw.fields;
  const iterPath: string = fields['System.IterationPath'] || '';
  const sprintMatch = iterPath.match(/Sprint (\d+)/i);
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
    developer: '',
    url: `${baseUrl}/${PROJECT}/_workitems/edit/${raw.id}`,
  };
}

function resolveDeveloper(item: WorkItem, relations: any[], childrenMap: Map<number, any>): string {
  const childLinks = (relations || []).filter(
    (r: any) => r.rel === 'System.LinkTypes.Hierarchy-Forward'
  );
  if (!childLinks.length) return item.assignedTo;

  const childIds = childLinks.map((r: any) => {
    const parts = r.url.split('/');
    return parseInt(parts[parts.length - 1]);
  });

  const tasks = childIds
    .map(id => childrenMap.get(id))
    .filter((c: any) => c && c.fields['System.WorkItemType'] === 'Task');

  for (const task of tasks) {
    const activity: string = (task.fields['Microsoft.VSTS.Common.Activity'] || '').toLowerCase();
    if (activity === 'development' || activity === 'design') {
      return task.fields['System.AssignedTo']?.displayName || '';
    }
  }

  for (const task of tasks) {
    if (task.fields['System.AssignedTo']?.displayName) {
      return task.fields['System.AssignedTo'].displayName;
    }
  }

  return item.assignedTo;
}

// Main function: get stories for demo planning
// Shows: stories from the highest sprint that has demo tag (excluding already-demoed) + all subsequent sprints up to current
export async function getStoriesForDemo(): Promise<WorkItem[]> {
  const areaPath = `${PROJECT}\\Returns`;

  // Step 1: Find the highest sprint number that has demo-tagged items (last demo sprint)
  const demoWiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER '${areaPath}'
      AND [System.Tags] CONTAINS 'demo'
  `;
  const demoResult = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: demoWiql }),
  });

  const demoIds: number[] = demoResult.workItems.map((w: { id: number }) => w.id);
  if (!demoIds.length) return [];

  // Fetch demo items to find max sprint
  const demoRaw = await getWorkItemsBatch(demoIds);
  let maxDemoSprint = 0;
  for (const raw of demoRaw) {
    const iterPath: string = raw.fields['System.IterationPath'] || '';
    const match = iterPath.match(/Sprint (\d+)/i);
    if (match) maxDemoSprint = Math.max(maxDemoSprint, parseInt(match[1]));
  }

  if (!maxDemoSprint) return [];

  // Step 2: Query all stories under Returns iteration, then filter to maxDemoSprint onward
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] IN ('User Story', 'Bug')
      AND [System.AreaPath] UNDER '${areaPath}'
      AND [System.IterationPath] UNDER '${areaPath}'
    ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC
  `;
  const result = await adoFetch(api('wit/wiql?api-version=7.1'), {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const ids: number[] = result.workItems.map((w: { id: number }) => w.id);
  if (!ids.length) return [];

  const items = await getWorkItemsBatch(ids);

  // Filter to only items from maxDemoSprint onward BEFORE resolving children
  const relevantItems = items.filter((raw: any) => {
    const iterPath: string = raw.fields['System.IterationPath'] || '';
    const match = iterPath.match(/Sprint (\d+)/i);
    return match && parseInt(match[1]) >= maxDemoSprint;
  });

  // Collect child IDs for developer resolution
  const allChildIds: number[] = [];
  for (const raw of relevantItems) {
    const childLinks = (raw.relations || []).filter(
      (r: any) => r.rel === 'System.LinkTypes.Hierarchy-Forward'
    );
    for (const link of childLinks) {
      const parts = link.url.split('/');
      allChildIds.push(parseInt(parts[parts.length - 1]));
    }
  }

  const childrenMap = new Map<number, any>();
  if (allChildIds.length) {
    const children = await getWorkItemsBatch(allChildIds);
    for (const child of children) childrenMap.set(child.id, child);
  }

  // Parse and filter
  const allItems: WorkItem[] = [];
  for (const raw of relevantItems) {
    const item = parseWorkItem(raw);
    item.developer = resolveDeveloper(item, raw.relations || [], childrenMap);
    allItems.push(item);
  }

  // Include all items from maxDemoSprint onward
  // Demo-tagged items from the demo sprint will be shown as grayed out in the UI
  return allItems
    .sort((a, b) => a.sprintNumber - b.sprintNumber || a.boardPriority - b.boardPriority);
}

// Add "demo" tag to items
export async function addDemoTag(ids: number[]): Promise<void> {
  for (const id of ids) {
    await adoFetch(api(`wit/workitems/${id}?api-version=7.1`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([{ op: 'add', path: '/fields/System.Tags', value: await getTagsWithDemo(id) }]),
    });
  }
}

// Remove "demo" tag from items
export async function removeDemoTag(ids: number[]): Promise<void> {
  for (const id of ids) {
    await adoFetch(api(`wit/workitems/${id}?api-version=7.1`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([{ op: 'add', path: '/fields/System.Tags', value: await getTagsWithoutDemo(id) }]),
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
