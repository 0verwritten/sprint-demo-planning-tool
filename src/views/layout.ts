export function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sprint Demo Planner</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen p-6">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Sprint Demo Planner</h1>
    <div id="content">${content}</div>
  </div>
</body>
</html>`;
}
