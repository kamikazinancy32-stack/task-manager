import { PriorityTask, User } from '../../models.js';
import { APIError } from '../../api.js';
import { withReadableTitles } from '../../titles.js';
import {
  toTasks,
  toUsers,
  buildUserMap,
  linkTasksToUsers,
  summarize,
  userReport,
  getPending,
  getOverdue,
  sortByPriority,
  searchByTitle,
  markCompleted,
  getUniqueCategories,
  CATEGORIES,
} from '../../taskProcessor.js';
import { createMockApiClient, mockTodos, mockUsers } from '../mocks/api.js';

// "Today" is 15 October 2026, so the made-up due dates (id % 14 - 7 days from today) are fixed:
// ids 1, 2 and 5 are pending and overdue, id 7 is due today, id 8 is due tomorrow
const TODAY = new Date(2026, 9, 15, 10, 0);

const ids = (list) => list.map((item) => item.id);

// The same steps main.js runs when the app starts (main.js itself starts the CLI, so it is not imported)
const loadData = async (client) => {
  const { tasks, users } = await client.getTasksAndUsers();
  const taskList = toTasks(withReadableTitles(tasks));
  const userMap = linkTasksToUsers(taskList, buildUserMap(toUsers(users)));
  return { tasks: taskList, userMap };
};

let client;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
  client = createMockApiClient();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('workflow 1: start the app and show the summary and user report', () => {
  test('API data becomes tasks and users, then totals and a ranked report', async () => {
    // Step 1: the mocked API is called once and returns the raw records
    const raw = await client.getTasksAndUsers();
    expect(client.getTasks).toHaveBeenCalledTimes(1);
    expect(client.getUsers).toHaveBeenCalledTimes(1);
    expect(raw.tasks).toHaveLength(8);
    expect(raw.users).toHaveLength(3);

    // Step 2: Lorem Ipsum titles are swapped for English ones; English titles stay the same
    const readable = withReadableTitles(raw.tasks);
    expect(readable[0].title).toBe('Write unit tests for the mobile app');
    expect(readable[3].title).toBe('Write the monthly report');

    // Step 3: records become PriorityTask and User objects
    const tasks = toTasks(readable);
    const users = toUsers(raw.users);
    expect(tasks.every((task) => task instanceof PriorityTask)).toBe(true);
    expect(users.every((user) => user instanceof User)).toBe(true);
    expect(getUniqueCategories(tasks)).toEqual(new Set(CATEGORIES));

    // Step 4: each user gets their own tasks
    const userMap = linkTasksToUsers(tasks, buildUserMap(users));
    expect(ids(userMap.get(1).tasks)).toEqual([1, 2, 3]);
    expect(userMap.get(2).getCompletionRate()).toBe(67);
    expect(ids(userMap.get(1).getTasksByStatus('overdue'))).toEqual([1, 2]);

    // Step 5: the final output
    expect(summarize(tasks)).toEqual({
      total: 8,
      completed: 3,
      pending: 5,
      byPriority: { high: 2, medium: 3, low: 3 },
    });
    expect(ids(getOverdue(tasks))).toEqual([1, 2, 5]);
    expect(userReport(tasks, userMap)).toEqual([
      { id: 2, name: 'Ervin Howell', total: 3, completed: 2 },
      { id: 1, name: 'Leanne Graham', total: 3, completed: 1 },
      { id: 3, name: 'Clementine Bauch', total: 2, completed: 0 },
    ]);
  });

  test('searching the loaded tasks finds titles from the API and leaves the list unchanged', async () => {
    const { tasks } = await loadData(client);

    expect(searchByTitle(tasks, 'REPORT').map((task) => task.title)).toEqual([
      'Write the monthly report',
      'Update the report template',
    ]);
    expect(tasks).toHaveLength(8);
  });
});

describe('workflow 2: show one user\'s unfinished tasks, most important first', () => {
  test('fetchUserTodos -> tasks -> pending only -> sorted -> printed lines', async () => {
    // Step 1: only user 3's todos come back
    const todos = await client.fetchUserTodos(3);
    expect(client.fetchUserTodos).toHaveBeenCalledWith(3);
    expect(todos.every((todo) => todo.userId === 3)).toBe(true);

    // Step 2: turned into tasks, and only the pending ones kept
    const pending = getPending(toTasks(withReadableTitles(todos)));
    expect(ids(pending)).toEqual([7, 8]);

    // Step 3: high priority first (id 8 is even, so high; id 7 is odd, so medium)
    const sorted = sortByPriority(pending);
    expect(sorted.map((task) => task.priority)).toEqual(['high', 'medium']);

    // Step 4: the lines the CLI would print
    expect(sorted.map((task) => task.describe())).toEqual([
      '[ ] #8 Update the report template (high, due 2026-10-16)',
      '[ ] #7 Fix the login bug (medium, due 2026-10-15)',
    ]);
  });
});

describe('workflow 3: complete a task and see every total update', () => {
  test('markCompleted -> relink users -> new completion rate and summary', async () => {
    // Step 1: before - task 5 is pending, overdue and medium
    const { tasks, userMap } = await loadData(client);
    const before = tasks.find((task) => task.id === 5);
    expect(before.getStatus()).toBe('overdue');
    expect(userMap.get(2).getCompletionRate()).toBe(67);

    // Step 2: complete it, then give the users the new task list
    const updated = markCompleted(tasks, 5);
    linkTasksToUsers(updated, userMap);
    const after = updated.find((task) => task.id === 5);
    expect(after.getStatus()).toBe('completed');
    expect(after.priority).toBe('low');

    // Step 3: the totals follow the change
    expect(userMap.get(2).getCompletionRate()).toBe(100);
    expect(summarize(updated)).toMatchObject({ completed: 4, pending: 4 });
    expect(ids(getOverdue(updated))).toEqual([1, 2]);

    // Step 4: the original list was not changed
    expect(before.getStatus()).toBe('overdue');
    expect(summarize(tasks).completed).toBe(3);
  });
});

describe('workflow 4: bad answers from the API', () => {
  test('if the API fails, the error reaches the caller and nothing is processed', async () => {
    client.getUsers.mockRejectedValueOnce(
      new APIError('The server answered /users with error status 500.', 'http')
    );

    await expect(loadData(client)).rejects.toThrow('The server answered /users with error status 500.');
    expect(client.getTasks).toHaveBeenCalledTimes(1);
  });

  test('malformed records from the API are skipped and the rest still works', async () => {
    client.getTasks.mockResolvedValueOnce([null, 'oops', { title: 'no id' }, ...mockTodos.slice(0, 2)]);
    client.getUsers.mockResolvedValueOnce([{ name: 'no id' }, mockUsers[0]]);

    const { tasks, userMap } = await loadData(client);

    expect(ids(tasks)).toEqual([1, 2]);
    expect([...userMap.keys()]).toEqual([1]);
    expect(userMap.get(1).getCompletionRate()).toBe(0);
  });

  test('an API that sends something that is not a list gives an empty, safe result', async () => {
    client.getTasks.mockResolvedValueOnce({ error: 'unexpected' });

    const { tasks, userMap } = await loadData(client);

    expect(tasks).toEqual([]);
    expect(summarize(tasks).total).toBe(0);
    expect(userMap.get(1).tasks).toEqual([]);
  });
});
