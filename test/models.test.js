import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Task, PriorityTask, User } from '../models.js';

test('Task uses default values when data is missing', () => {
  const task = new Task();
  assert.equal(task.title, 'Untitled task');
  assert.equal(task.completed, false);
});

test('PriorityTask inherits from Task and adds a priority', () => {
  const task = new PriorityTask({ id: 3, title: 'write report' }, 'high');
  assert.ok(task instanceof Task);
  assert.equal(task.isCompleted(), false);
  assert.equal(task.getRank(), 3);
  assert.equal(task.describe(), '[ ] #3 write report (high)');
});

test('PriorityTask falls back to medium for an unknown priority', () => {
  assert.equal(new PriorityTask({}, 'urgent').priority, 'medium');
});

test('Task.toggle() switches completed on and off', () => {
  const task = new Task({ id: 1 });
  assert.equal(task.toggle().completed, true);
  assert.equal(task.toggle().completed, false);
});

test('a plain Task is never overdue and its status is completed or pending', () => {
  const task = new Task({ id: 1 });
  assert.equal(task.isOverdue(), false);
  assert.equal(task.getStatus(), 'pending');
  assert.equal(task.toggle().getStatus(), 'completed');
});

test('PriorityTask.toggle() also updates the priority (completed = low)', () => {
  const task = new PriorityTask({ id: 2 }, 'high');
  task.toggle();
  assert.equal(task.completed, true);
  assert.equal(task.priority, 'low');
  task.toggle();
  assert.equal(task.priority, 'high'); // back to the rule for an even, unfinished task
});

test('PriorityTask.isOverdue() and getStatus() use the due date', () => {
  const today = new Date(2026, 9, 19);
  const late = new PriorityTask({ id: 1, dueDate: new Date(2026, 9, 18) });
  const dueToday = new PriorityTask({ id: 2, dueDate: new Date(2026, 9, 19) });
  const doneLate = new PriorityTask({ id: 3, completed: true, dueDate: new Date(2026, 9, 1) });
  const noDate = new PriorityTask({ id: 4 });

  assert.equal(late.isOverdue(today), true);
  assert.equal(late.getStatus(today), 'overdue');
  assert.equal(dueToday.isOverdue(today), false);
  assert.equal(dueToday.getStatus(today), 'pending');
  assert.equal(doneLate.isOverdue(today), false);
  assert.equal(doneLate.getStatus(today), 'completed');
  assert.equal(noDate.isOverdue(today), false);
});

test('PriorityTask ignores a malformed due date', () => {
  assert.equal(new PriorityTask({ id: 1, dueDate: 'not a date' }).dueDate, null);
});

test('PriorityTask.describe() shows the priority and due date', () => {
  const task = new PriorityTask({ id: 5, title: 'test', dueDate: new Date(2026, 0, 9) }, 'low');
  assert.equal(task.describe(), '[ ] #5 test (low, due 2026-01-09)');
});

test('Task falls back to safe values for malformed data', () => {
  const task = new Task({ id: 1, title: 42, completed: 'yes' });
  assert.equal(task.title, 'Untitled task');
  assert.equal(task.completed, false);
});

test('User.addTask(), getCompletionRate() and getTasksByStatus()', () => {
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, 0, 1);
  const user = new User({ id: 1, name: 'Ana' });

  assert.equal(user.getCompletionRate(), 0); // no tasks yet

  user
    .addTask(new PriorityTask({ id: 1, completed: true }))
    .addTask(new PriorityTask({ id: 2 }))
    .addTask(new PriorityTask({ id: 3, dueDate: lastYear }))
    .addTask(new PriorityTask({ id: 4, completed: true }));

  assert.equal(user.tasks.length, 4);
  assert.equal(user.getCompletionRate(), 50);
  assert.deepEqual(user.getTasksByStatus('completed').map((t) => t.id), [1, 4]);
  assert.deepEqual(user.getTasksByStatus('pending').map((t) => t.id), [2]);
  assert.deepEqual(user.getTasksByStatus('overdue').map((t) => t.id), [3]);
});

test('User reads the city, with a fallback when the address is missing', () => {
  assert.equal(new User({ address: { city: 'Kigali' } }).city, 'Kigali');
  assert.equal(new User({ name: 'No Address' }).city, 'Unknown city');
});
