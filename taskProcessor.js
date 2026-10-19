import { PriorityTask, User, pickPriority } from './models.js';

// JSONPlaceholder has no categories or due dates either, so these are made up from the id.
// This is demo data, so the Set, isOverdue() and getStatus() have something to work with.
export const CATEGORIES = ['work', 'study', 'home'];

const pickCategory = ({ id }) => CATEGORIES[id % CATEGORIES.length];

// Due somewhere between 7 days ago and 6 days from today
const pickDueDate = ({ id }, today = new Date()) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate() + (id % 14) - 7);

// Malformed data: skip anything that is not an object with a whole-number id
const isValidRecord = (raw) => typeof raw === 'object' && raw !== null && Number.isInteger(raw.id);

// If the API sends something that is not an array, treat it as an empty list
const asList = (value) => (Array.isArray(value) ? value : []);

export const toTasks = (rawTasks = []) =>
  asList(rawTasks)
    .filter(isValidRecord)
    .map((raw) => {
      const data = {
        ...raw,
        completed: raw.completed === true,
        category: pickCategory(raw),
        dueDate: pickDueDate(raw),
      };
      return new PriorityTask(data, pickPriority(data));
    });

export const toUsers = (rawUsers = []) =>
  asList(rawUsers)
    .filter(isValidRecord)
    .map((raw) => new User(raw));

export const getOverdue = (tasks) => tasks.filter((task) => task.isOverdue());

export const getCompleted = (tasks) => tasks.filter((task) => task.isCompleted());

export const getPending = (tasks) => tasks.filter((task) => !task.isCompleted());

export const filterByPriority = (tasks, level) =>
  tasks.filter(({ priority }) => priority === level);

export const searchByTitle = (tasks, word) => {
  const needle = word.toLowerCase();
  return tasks.filter(({ title }) => title.toLowerCase().includes(needle));
};

export const filterByUsers = (tasks, ...userIds) => {
  const wanted = new Set(userIds);
  return tasks.filter(({ userId }) => wanted.has(userId));
};

export const sortByTitle = (tasks) =>
  [...tasks].sort((a, b) => a.title.localeCompare(b.title));

export const sortByPriority = (tasks) =>
  [...tasks].sort((a, b) => b.getRank() - a.getRank() || a.id - b.id);

export const countCompleted = (tasks) =>
  tasks.reduce((count, task) => (task.isCompleted() ? count + 1 : count), 0);

export const summarize = (tasks) =>
  tasks.reduce(
    (totals, task) => {
      totals.total += 1;
      totals[task.isCompleted() ? 'completed' : 'pending'] += 1;
      totals.byPriority[task.priority] += 1;
      return totals;
    },
    { total: 0, completed: 0, pending: 0, byPriority: { high: 0, medium: 0, low: 0 } }
  );

export const getUniqueUserIds = (tasks) => new Set(tasks.map(({ userId }) => userId));

// A Set keeps each category only once, e.g. 200 tasks -> { 'work', 'study', 'home' }
export const getUniqueCategories = (tasks) => new Set(tasks.map(({ category }) => category));

export const buildUserMap = (users) => new Map(users.map((user) => [user.id, user]));

// Gives every User the list of their own tasks (User.addTask).
// It starts each list again from empty, so it can be called again after a task changes.
export const linkTasksToUsers = (tasks, userMap) => {
  userMap.forEach((user) => {
    user.tasks = [];
  });
  tasks.forEach((task) => userMap.get(task.userId)?.addTask(task));
  return userMap;
};

export const groupByUser = (tasks) => {
  const groups = new Map();

  tasks.forEach((task) => {
    const list = groups.get(task.userId) ?? [];
    list.push(task);
    groups.set(task.userId, list);
  });

  return groups;
};

export const userReport = (tasks, userMap) =>
  [...groupByUser(tasks)]
    .map(([userId, userTasks]) => {
      const { name = `User ${userId}` } = userMap.get(userId) ?? {};
      return { id: userId, name, total: userTasks.length, completed: countCompleted(userTasks) };
    })
    .sort((a, b) => b.completed - a.completed);

// Copy the task first (so the original is not changed), then toggle() the copy.
// PriorityTask.toggle() also re-applies the priority rule, so the task becomes 'low'.
export const markCompleted = (tasks, id) =>
  tasks.map((task) =>
    task.id === id && !task.isCompleted()
      ? new PriorityTask({ ...task }, task.priority).toggle()
      : task
  );

// An id must be digits only and bigger than 0. This rejects "abc", "-1", "0", "1.5", "0x4" and "1e0"
export const isValidId = (text) => /^\d+$/.test(text) && Number(text) > 0;

export const parseIds = (args) => {
  const invalid = args.filter((arg) => !isValidId(arg));
  const ids = invalid.length === 0 ? args.map(Number) : [];
  return { ids, invalid };
};

export const createCounter = () => {
  let count = 0;

  return {
    increment: () => ++count,
    current: () => count,
  };
};
