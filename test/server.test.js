import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskManagerServer } from '../server.js';

const fakeClient = (tasks = [
  { id: 1, title: 'Write Alpha report', completed: false, userId: 1 },
  { id: 2, title: 'Review Beta plan', completed: true, userId: 1 },
  { id: 3, title: 'Alpha launch', completed: false, userId: 2 },
  { id: 4, title: 'Alpha checklist', completed: false, userId: 1 },
], users = [
  { id: 1, name: 'Ari' },
  { id: 2, name: 'Bo' },
]) => ({ getTasksAndUsers: async () => ({ tasks, users }) });

const withServer = async (client, callback) => {
  const server = createTaskManagerServer({ client });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('homepage and browser assets are served from the public directory', async () => {
  await withServer(fakeClient(), async (baseUrl) => {
    const homepage = await fetch(baseUrl);
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers.get('content-type'), /text\/html/);
    assert.match(await homepage.text(), /Task Manager/);

    const stylesheet = await fetch(`${baseUrl}/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /text\/css/);

    const script = await fetch(`${baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  });
});

test('task data supports existing search, status, user, and title-sort logic', async () => {
  let loads = 0;
  const client = fakeClient();
  client.getTasksAndUsers = async () => {
    loads += 1;
    return fakeClient().getTasksAndUsers();
  };

  await withServer(client, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks?search=ALPHA&status=pending&userId=1&sort=title`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.tasks.map(({ id }) => id), [4, 1]);
    assert.equal(body.tasks[0].user.name, 'Ari');
    assert.deepEqual(body.summary, {
      total: 4,
      completed: 1,
      pending: 3,
      byPriority: { high: 1, medium: 2, low: 1 },
      overdue: body.summary.overdue,
    });
    const priorityResponse = await fetch(`${baseUrl}/api/tasks?priority=high`);
    const priorityBody = await priorityResponse.json();
    assert.deepEqual(priorityBody.tasks.map(({ id }) => id), [4]);
    assert.equal(loads, 1);
  });
});

test('invalid task IDs and unsupported filters are rejected', async () => {
  await withServer(fakeClient(), async (baseUrl) => {
    const invalidId = await fetch(`${baseUrl}/api/tasks/nope`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(invalidId.status, 400);

    const oversizedId = await fetch(`${baseUrl}/api/tasks/${'9'.repeat(40)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(oversizedId.status, 400);

    const invalidFilter = await fetch(`${baseUrl}/api/tasks?status=everything`);
    assert.equal(invalidFilter.status, 400);

    const unknownTask = await fetch(`${baseUrl}/api/tasks/999`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(unknownTask.status, 404);
  });
});

test('task completion toggles in server memory and updates priority', async () => {
  await withServer(fakeClient(), async (baseUrl) => {
    const completed = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    const completedTask = await completed.json();
    assert.equal(completedTask.completed, true);
    assert.equal(completedTask.priority, 'low');

    const reopened = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: false }),
    });
    const reopenedTask = await reopened.json();
    assert.equal(reopenedTask.completed, false);
    assert.equal(reopenedTask.priority, 'medium');
  });
});

test('invalid mutation bodies are rejected', async () => {
  await withServer(fakeClient(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: 'yes' }),
    });
    assert.equal(response.status, 400);
  });
});

test('Lorem Ipsum titles are shown in English, and search and sort use the English titles', async () => {
  const client = fakeClient([
    { id: 1, title: 'delectus aut autem', completed: false, userId: 1 },
    { id: 2, title: 'quis ut nam facilis et officia qui', completed: true, userId: 2 },
    { id: 3, title: 'Write Alpha report', completed: false, userId: 1 },
  ]);

  await withServer(client, async (baseUrl) => {
    const all = await (await fetch(`${baseUrl}/api/tasks`)).json();
    assert.deepEqual(all.tasks.map(({ id, title, completed }) => ({ id, title, completed })), [
      { id: 1, title: 'Write unit tests for the mobile app', completed: false },
      { id: 2, title: 'Review the pull request for the mobile app', completed: true },
      { id: 3, title: 'Write Alpha report', completed: false },
    ]);
    assert.equal(all.tasks[1].priority, 'low');
    assert.equal(all.tasks[1].user.name, 'Bo');

    const search = await (await fetch(`${baseUrl}/api/tasks?search=pull%20request`)).json();
    assert.deepEqual(search.tasks.map(({ id }) => id), [2]);
    const latinSearch = await (await fetch(`${baseUrl}/api/tasks?search=delectus`)).json();
    assert.deepEqual(latinSearch.tasks, []);

    const sorted = await (await fetch(`${baseUrl}/api/tasks?sort=title`)).json();
    assert.deepEqual(sorted.tasks.map(({ id }) => id), [2, 3, 1]);

    const again = await (await fetch(`${baseUrl}/api/tasks`)).json();
    assert.deepEqual(again.tasks.map(({ title }) => title), all.tasks.map(({ title }) => title));
  });
});

test('completing a task on the website keeps its English title', async () => {
  const client = fakeClient([{ id: 1, title: 'delectus aut autem', completed: false, userId: 1 }]);
  await withServer(client, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    const task = await response.json();
    assert.equal(task.title, 'Write unit tests for the mobile app');
    assert.equal(task.completed, true);
  });
});

test('due dates show the same local calendar date as the CLI, even far ahead of UTC', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: toISOString() would show the previous day
  try {
    await withServer(fakeClient(), async (baseUrl) => {
      const { tasks } = await (await fetch(`${baseUrl}/api/tasks`)).json();
      const task = tasks.find(({ id }) => id === 2);
      const now = new Date();
      const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (2 % 14) - 7);
      const expected = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
      assert.equal(task.dueDate, expected);
    });
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test('upstream API failures return a generic message without exposing details', async () => {
  await withServer({ getTasksAndUsers: async () => { throw new Error('secret upstream stack detail'); } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error, /temporarily unavailable/);
    assert.doesNotMatch(JSON.stringify(body), /secret upstream/);
  });
});