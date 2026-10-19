import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APIClient } from './api.js';
import { PRIORITIES, formatDate } from './models.js';
import {
  buildUserMap,
  filterByPriority,
  filterByUsers,
  getCompleted,
  getOverdue,
  getPending,
  isValidId,
  linkTasksToUsers,
  searchByTitle,
  sortByTitle,
  summarize,
  toTasks,
  toUsers,
  userReport,
} from './taskProcessor.js';
import { withReadableTitles } from './titles.js';

const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const STATUSES = new Set(['all', 'completed', 'pending', 'overdue']);
const MAX_BODY_SIZE = 1024;
const isSafeId = (text) => isValidId(text) && Number.isSafeInteger(Number(text));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const send = (response, status, body, contentType = 'application/json; charset=utf-8') => {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
  });
  response.end(body);
};

const sendJson = (response, status, value) =>
  send(response, status, JSON.stringify(value));

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
};

const publicTask = (task, userMap) => ({
  id: task.id,
  title: task.title,
  completed: task.completed,
  priority: task.priority,
  status: task.getStatus(),
  // Local calendar date, same as the CLI (toISOString() would shift it to UTC)
  dueDate: task.dueDate ? formatDate(task.dueDate) : null,
  user: {
    id: task.userId,
    name: userMap.get(task.userId)?.name ?? `User ${task.userId}`,
  },
});

const getFilteredTasks = (url, state) => {
  const params = url.searchParams;
  const status = params.get('status') ?? 'all';
  const priority = params.get('priority') ?? '';
  const search = params.get('search') ?? '';
  const userId = params.get('userId');
  const sort = params.get('sort') ?? '';

  if (!STATUSES.has(status)) throw new HttpError(400, 'Choose a valid task status.');
  if (priority && !PRIORITIES.includes(priority)) throw new HttpError(400, 'Choose a valid priority.');
  if (search.length > 120) throw new HttpError(400, 'Search must be 120 characters or fewer.');
  if (userId !== null && !isSafeId(userId)) throw new HttpError(400, 'User ID must be a positive whole number.');
  if (sort && sort !== 'title') throw new HttpError(400, 'Choose a supported sort order.');

  let tasks = state.tasks;
  if (status === 'completed') tasks = getCompleted(tasks);
  if (status === 'pending') tasks = getPending(tasks);
  if (status === 'overdue') tasks = getOverdue(tasks);
  if (priority) tasks = filterByPriority(tasks, priority);
  if (search.trim()) tasks = searchByTitle(tasks, search.trim());
  if (userId !== null) {
    const id = Number(userId);
    if (!state.userMap.has(id)) throw new HttpError(400, 'No user found with that ID.');
    tasks = filterByUsers(tasks, id);
  }
  if (sort === 'title') tasks = sortByTitle(tasks);
  return tasks;
};

export const createTaskManagerServer = ({ client = new APIClient() } = {}) => {
  let statePromise;
  const getState = () => {
    if (!statePromise) {
      statePromise = client.getTasksAndUsers()
        .then(({ tasks, users }) => {
          // Swap Lorem Ipsum titles for English ones before anything else,
          // so search and sort on the website use the titles people actually see
          const taskList = toTasks(withReadableTitles(tasks));
          const userMap = linkTasksToUsers(taskList, buildUserMap(toUsers(users)));
          return { tasks: taskList, userMap };
        })
        .catch((error) => {
          statePromise = undefined;
          throw error;
        });
    }
    return statePromise;
  };

  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && PUBLIC_FILES.has(url.pathname)) {
        const [filename, contentType] = PUBLIC_FILES.get(url.pathname);
        const file = await readFile(new URL(`./public/${filename}`, import.meta.url));
        send(response, 200, file, contentType);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/tasks') {
        const state = await getState();
        const totals = summarize(state.tasks);
        const users = userReport(state.tasks, state.userMap).map(({ id, name, total, completed }) => ({
          id,
          name,
          total,
          completed,
        }));
        sendJson(response, 200, {
          tasks: getFilteredTasks(url, state).map((task) => publicTask(task, state.userMap)),
          users,
          summary: { ...totals, overdue: getOverdue(state.tasks).length },
        });
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === 'PATCH' && taskMatch) {
        const [rawId] = taskMatch.slice(1);
        if (!isSafeId(rawId)) throw new HttpError(400, 'Task ID must be a positive whole number.');
        if (!request.headers['content-type']?.includes('application/json')) {
          throw new HttpError(415, 'Content-Type must be application/json.');
        }
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 1 || typeof body.completed !== 'boolean') {
          throw new HttpError(400, 'Provide only a boolean completed value.');
        }
        const state = await getState();
        const task = state.tasks.find(({ id }) => id === Number(rawId));
        if (!task) throw new HttpError(404, 'Task not found.');
        if (task.completed !== body.completed) task.toggle();
        sendJson(response, 200, publicTask(task, state.userMap));
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
      } else if (url.pathname.startsWith('/api/')) {
        sendJson(response, 502, { error: 'Task data is temporarily unavailable. Please try again.' });
      } else {
        sendJson(response, 500, { error: 'The requested page could not be loaded.' });
      }
    }
  });
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT) || 3000;
  createTaskManagerServer().listen(port, '0.0.0.0', () => {
    console.log(`Task Manager web app listening on port ${port}`);
  });
}