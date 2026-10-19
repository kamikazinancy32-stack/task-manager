import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PriorityTask } from '../models.js';
import {
  toTasks,
  getCompleted,
  getPending,
  filterByPriority,
  searchByTitle,
  filterByUsers,
  sortByTitle,
  sortByPriority,
  summarize,
  markCompleted,
  isValidId,
  parseIds,
  createCounter,
  toUsers,
  buildUserMap,
  linkTasksToUsers,
  getOverdue,
  getUniqueCategories,
  CATEGORIES,
} from '../taskProcessor.js';

// Small fake data set, so no internet is needed
const makeTasks = () =>
  toTasks([
    { id: 1, title: 'beta', completed: false, userId: 1 },
    { id: 2, title: 'Alpha', completed: true, userId: 2 },
    { id: 4, title: 'gamma dolor', completed: false, userId: 1 },
  ]);

test('priorities follow the rules: completed = low, pending even id = high, pending odd id = medium', () => {
  const priorities = makeTasks().map((task) => task.priority);
  assert.deepEqual(priorities, ['medium', 'low', 'high']);
});

test('markCompleted marks the task done and changes its priority to low', () => {
  const tasks = makeTasks();
  const updated = markCompleted(tasks, 1);
  const task = updated.find((t) => t.id === 1);

  assert.equal(task.completed, true);
  assert.equal(task.priority, 'low');
  assert.ok(task instanceof PriorityTask);
});

test('markCompleted does not change the original array or other tasks', () => {
  const tasks = makeTasks();
  const updated = markCompleted(tasks, 1);

  assert.notEqual(updated, tasks);
  assert.equal(tasks[0].completed, false);
  assert.equal(tasks[0].priority, 'medium');
  assert.equal(updated[2], tasks[2]);
});

test('summary counts stay consistent after completing a task', () => {
  const tasks = markCompleted(makeTasks(), 4);
  const { total, completed, pending, byPriority } = summarize(tasks);

  assert.equal(total, 3);
  assert.equal(completed, 2);
  assert.equal(pending, 1);
  assert.equal(byPriority.low, completed);
  assert.deepEqual(byPriority, { high: 0, medium: 1, low: 2 });
});

test('isValidId accepts positive whole numbers only', () => {
  ['1', '5', '200'].forEach((text) => assert.equal(isValidId(text), true, text));
  ['abc', '0', '-1', '1.5', '0x4', '1e0', '', ' 3', '+2'].forEach((text) =>
    assert.equal(isValidId(text), false, text)
  );
});

test('parseIds returns numbers when every id is valid', () => {
  assert.deepEqual(parseIds(['1', '3']), { ids: [1, 3], invalid: [] });
});

test('parseIds rejects the whole input if any id is invalid', () => {
  assert.deepEqual(parseIds(['abc', '5']), { ids: [], invalid: ['abc'] });
  assert.deepEqual(parseIds(['0x4']), { ids: [], invalid: ['0x4'] });
  assert.deepEqual(parseIds(['1e0']), { ids: [], invalid: ['1e0'] });
});

test('filters return the right tasks', () => {
  const tasks = makeTasks();

  assert.deepEqual(getCompleted(tasks).map((t) => t.id), [2]);
  assert.deepEqual(getPending(tasks).map((t) => t.id), [1, 4]);
  assert.deepEqual(filterByPriority(tasks, 'high').map((t) => t.id), [4]);
  assert.deepEqual(searchByTitle(tasks, 'DOLOR').map((t) => t.id), [4]);
  assert.deepEqual(filterByUsers(tasks, 2).map((t) => t.id), [2]);
  assert.deepEqual(filterByUsers(tasks, 1, 2).length, 3);
});

test('sortByTitle sorts A-Z without changing the original array', () => {
  const tasks = makeTasks();
  const sorted = sortByTitle(tasks);

  assert.deepEqual(sorted.map((t) => t.title), ['Alpha', 'beta', 'gamma dolor']);
  assert.deepEqual(tasks.map((t) => t.id), [1, 2, 4]);
});

test('sortByPriority puts high first and breaks ties by id', () => {
  const tasks = makeTasks();
  assert.deepEqual(sortByPriority(tasks).map((t) => t.id), [4, 1, 2]);
  assert.deepEqual(tasks.map((t) => t.id), [1, 2, 4]);
});

test('functions handle an empty list without crashing', () => {
  assert.deepEqual(summarize([]), {
    total: 0,
    completed: 0,
    pending: 0,
    byPriority: { high: 0, medium: 0, low: 0 },
  });
  assert.deepEqual(sortByTitle([]), []);
  assert.deepEqual(markCompleted([], 1), []);
});

test('toTasks gives every task a category and a due date', () => {
  makeTasks().forEach((task) => {
    assert.ok(CATEGORIES.includes(task.category));
    assert.ok(task.dueDate instanceof Date);
  });
});

test('getUniqueCategories returns a Set with no duplicates', () => {
  const tasks = toTasks(
    Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `t${i}`, userId: 1 }))
  );
  const categories = getUniqueCategories(tasks);
  assert.ok(categories instanceof Set);
  assert.equal(categories.size, CATEGORIES.length);
});

test('getOverdue only returns unfinished tasks whose due date has passed', () => {
  const tasks = toTasks(
    Array.from({ length: 28 }, (_, i) => ({ id: i + 1, title: `t${i}`, completed: i % 3 === 0, userId: 1 }))
  );
  const overdue = getOverdue(tasks);
  assert.ok(overdue.length > 0);
  overdue.forEach((task) => {
    assert.equal(task.completed, false);
    assert.equal(task.getStatus(), 'overdue');
  });
});

test('toTasks and toUsers skip malformed data instead of crashing', () => {
  assert.deepEqual(toTasks({ not: 'a list' }), []);
  assert.deepEqual(toTasks(null), []);
  assert.deepEqual(toUsers('oops'), []);

  const tasks = toTasks([null, 'text', { title: 'no id' }, { id: 'x' }, { id: 7, title: 99 }]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 7);
  assert.equal(tasks[0].title, 'Untitled task');
});

test('markCompleted keeps the category and due date', () => {
  const tasks = makeTasks();
  const updated = markCompleted(tasks, 1).find((t) => t.id === 1);
  assert.equal(updated.category, tasks[0].category);
  assert.equal(updated.dueDate.getTime(), tasks[0].dueDate.getTime());
  assert.equal(updated.getStatus(), 'completed');
});

test('linkTasksToUsers gives each user their tasks, and can be run again after a change', () => {
  const tasks = makeTasks();
  const userMap = buildUserMap(toUsers([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]));

  linkTasksToUsers(tasks, userMap);
  assert.deepEqual(userMap.get(1).tasks.map((t) => t.id), [1, 4]);
  assert.equal(userMap.get(1).getCompletionRate(), 0);

  linkTasksToUsers(markCompleted(tasks, 1), userMap);
  assert.equal(userMap.get(1).tasks.length, 2); // not doubled
  assert.equal(userMap.get(1).getCompletionRate(), 50);
});

test('each counter keeps its own private count (closure)', () => {
  const first = createCounter();
  const second = createCounter();
  first.increment();
  first.increment();
  second.increment();

  assert.equal(first.current(), 2);
  assert.equal(second.current(), 1);
});
