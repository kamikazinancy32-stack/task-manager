import { Task, PriorityTask, User } from '../../models.js';
import {
  getCompleted,
  getPending,
  getOverdue,
  summarize,
  countCompleted,
  groupByUser,
  userReport,
  searchByTitle,
  filterByPriority,
  filterByUsers,
  sortByTitle,
  sortByPriority,
  toTasks,
  toUsers,
  buildUserMap,
  linkTasksToUsers,
  markCompleted,
  getUniqueUserIds,
  getUniqueCategories,
  isValidId,
  parseIds,
  createCounter,
  CATEGORIES,
} from '../../taskProcessor.js';

// "Today" in every test is 15 October 2026, 10:00 local time
const TODAY = new Date(2026, 9, 15, 10, 0);
const YESTERDAY = new Date(2026, 9, 14);
const TOMORROW = new Date(2026, 9, 16);

const ids = (tasks) => tasks.map((task) => task.id);

// Five tasks that cover every case: overdue, completed, due later, no due date
const makeTasks = () => [
  new PriorityTask({ id: 1, title: 'Write report', userId: 1, dueDate: YESTERDAY }, 'medium'),
  new PriorityTask({ id: 2, title: 'buy milk', completed: true, userId: 2, dueDate: YESTERDAY }, 'low'),
  new PriorityTask({ id: 3, title: 'Review report draft', userId: 1, dueDate: TOMORROW }, 'high'),
  new PriorityTask({ id: 4, title: 'Plan sprint', userId: 3 }, 'high'),
  new PriorityTask({ id: 5, title: 'archive files', completed: true, userId: 2 }, 'low'),
];

let tasks;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
  tasks = makeTasks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('filterByStatus: getCompleted, getPending, getOverdue', () => {
  test('getCompleted returns only the finished tasks', () => {
    expect(ids(getCompleted(tasks))).toEqual([2, 5]);
  });

  test('getPending returns only the unfinished tasks, including overdue ones', () => {
    expect(ids(getPending(tasks))).toEqual([1, 3, 4]);
  });

  test('getOverdue skips completed tasks, future due dates and tasks with no due date', () => {
    expect(ids(getOverdue(tasks))).toEqual([1]);
  });

  test('completed and pending together make up every task exactly once', () => {
    const together = [...getCompleted(tasks), ...getPending(tasks)];
    expect(together).toHaveLength(tasks.length);
    expect(new Set(together).size).toBe(tasks.length);
  });

  test('return an empty list for an empty list', () => {
    expect(getCompleted([])).toEqual([]);
    expect(getPending([])).toEqual([]);
    expect(getOverdue([])).toEqual([]);
  });

  test('return an empty list for null or undefined instead of crashing', () => {
    [null, undefined].forEach((value) => {
      expect(getCompleted(value)).toEqual([]);
      expect(getPending(value)).toEqual([]);
      expect(getOverdue(value)).toEqual([]);
    });
  });

  test('return an empty list for something that is not a list', () => {
    expect(getCompleted('tasks')).toEqual([]);
    expect(getPending({ id: 1 })).toEqual([]);
  });

  test('do not change the original list', () => {
    const result = getCompleted(tasks);
    expect(result).not.toBe(tasks);
    expect(ids(tasks)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('calculateStatistics: summarize and countCompleted', () => {
  const ZERO_STATS = { total: 0, completed: 0, pending: 0, byPriority: { high: 0, medium: 0, low: 0 } };

  test('summarize counts totals, completed, pending and each priority', () => {
    expect(summarize(tasks)).toEqual({
      total: 5,
      completed: 2,
      pending: 3,
      byPriority: { high: 2, medium: 1, low: 2 },
    });
  });

  test('countCompleted counts the finished tasks', () => {
    expect(countCompleted(tasks)).toBe(2);
  });

  test('completed + pending always equals total', () => {
    const { total, completed, pending } = summarize(tasks);
    expect(completed + pending).toBe(total);
  });

  test('give zero stats for an empty list', () => {
    expect(summarize([])).toEqual(ZERO_STATS);
    expect(countCompleted([])).toBe(0);
  });

  test('give zero stats for null or undefined instead of crashing', () => {
    expect(summarize(null)).toEqual(ZERO_STATS);
    expect(summarize(undefined)).toEqual(ZERO_STATS);
    expect(countCompleted(null)).toBe(0);
    expect(countCompleted(undefined)).toBe(0);
  });

  test('start from fresh totals on every call, so results never add up across calls', () => {
    const first = summarize(tasks);
    const second = summarize(tasks);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test('do not change the tasks', () => {
    summarize(tasks);
    expect(ids(getCompleted(tasks))).toEqual([2, 5]);
    expect(tasks.map((task) => task.priority)).toEqual(['medium', 'low', 'high', 'high', 'low']);
  });
});

describe('groupByUser', () => {
  test('groups tasks into a Map by userId', () => {
    const groups = groupByUser(tasks);
    expect(groups).toBeInstanceOf(Map);
    expect([...groups.keys()]).toEqual([1, 2, 3]);
    expect(ids(groups.get(1))).toEqual([1, 3]);
    expect(ids(groups.get(2))).toEqual([2, 5]);
    expect(ids(groups.get(3))).toEqual([4]);
  });

  test('keeps the very same task objects (no copies)', () => {
    expect(groupByUser(tasks).get(1)[0]).toBe(tasks[0]);
  });

  test('puts tasks with no userId under the key undefined', () => {
    const groups = groupByUser([new Task({ id: 9 })]);
    expect(ids(groups.get(undefined))).toEqual([9]);
  });

  test('returns an empty Map for an empty list', () => {
    expect(groupByUser([]).size).toBe(0);
  });

  test('returns an empty Map for null or undefined instead of crashing', () => {
    expect(groupByUser(null)).toEqual(new Map());
    expect(groupByUser(undefined)).toEqual(new Map());
  });

  test('does not change the original list', () => {
    groupByUser(tasks);
    expect(ids(tasks)).toEqual([1, 2, 3, 4, 5]);
  });

  test('userReport uses the groups to rank users by completed tasks, with a fallback name', () => {
    const userMap = buildUserMap([new User({ id: 1, name: 'Ana' }), new User({ id: 2, name: 'Ben' })]);
    expect(userReport(tasks, userMap)).toEqual([
      { id: 2, name: 'Ben', total: 2, completed: 2 },
      { id: 1, name: 'Ana', total: 2, completed: 0 },
      { id: 3, name: 'User 3', total: 1, completed: 0 },
    ]);
  });
});

describe('searchByProperty: searchByTitle, filterByPriority, filterByUsers', () => {
  test('searchByTitle finds part of a title and ignores upper/lower case', () => {
    expect(ids(searchByTitle(tasks, 'REPORT'))).toEqual([1, 3]);
  });

  test('searchByTitle returns an empty list when nothing matches', () => {
    expect(searchByTitle(tasks, 'holiday')).toEqual([]);
  });

  test('searchByTitle with an empty word matches every task', () => {
    expect(searchByTitle(tasks, '')).toHaveLength(5);
  });

  test('searchByTitle throws a clear error when the search word is not text', () => {
    expect(() => searchByTitle(tasks, undefined)).toThrow('searchByProperty() needs text to search for.');
    expect(() => searchByTitle(tasks, 42)).toThrow(TypeError);
  });

  test('filterByPriority returns one priority level, or nothing for an unknown level', () => {
    expect(ids(filterByPriority(tasks, 'high'))).toEqual([3, 4]);
    expect(filterByPriority(tasks, 'urgent')).toEqual([]);
  });

  test('filterByUsers returns the tasks of every user id given', () => {
    expect(ids(filterByUsers(tasks, 1, 3))).toEqual([1, 3, 4]);
    expect(filterByUsers(tasks)).toEqual([]);
    expect(filterByUsers(tasks, 99)).toEqual([]);
  });

  test('return an empty list for an empty list', () => {
    expect(searchByTitle([], 'report')).toEqual([]);
    expect(filterByPriority([], 'high')).toEqual([]);
    expect(filterByUsers([], 1)).toEqual([]);
  });

  test('return an empty list for null or undefined instead of crashing', () => {
    expect(searchByTitle(null, 'report')).toEqual([]);
    expect(filterByPriority(undefined, 'high')).toEqual([]);
    expect(filterByUsers(null, 1)).toEqual([]);
  });

  test('do not change the original list', () => {
    searchByTitle(tasks, 'report');
    filterByUsers(tasks, 1);
    expect(ids(tasks)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('sortBy: sortByTitle and sortByPriority', () => {
  test('sortByTitle sorts A-Z, ignoring upper/lower case', () => {
    expect(sortByTitle(tasks).map((task) => task.title)).toEqual([
      'archive files',
      'buy milk',
      'Plan sprint',
      'Review report draft',
      'Write report',
    ]);
  });

  test('sortByPriority puts high first, then medium, then low, and breaks ties by id', () => {
    expect(ids(sortByPriority(tasks))).toEqual([3, 4, 1, 2, 5]);
  });

  test('sortByPriority breaks ties by id even when the input is in reverse order', () => {
    expect(ids(sortByPriority([...tasks].reverse()))).toEqual([3, 4, 1, 2, 5]);
  });

  test('return a new list and leave the original order alone', () => {
    const sorted = sortByTitle(tasks);
    expect(sorted).not.toBe(tasks);
    expect(ids(tasks)).toEqual([1, 2, 3, 4, 5]);
    sortByPriority(tasks);
    expect(ids(tasks)).toEqual([1, 2, 3, 4, 5]);
  });

  test('return an empty list for an empty list, and a copy of a one-item list', () => {
    expect(sortByTitle([])).toEqual([]);
    const one = [tasks[0]];
    expect(sortByPriority(one)).toEqual(one);
    expect(sortByPriority(one)).not.toBe(one);
  });

  test('return an empty list for null or undefined instead of crashing', () => {
    expect(sortByTitle(null)).toEqual([]);
    expect(sortByTitle(undefined)).toEqual([]);
    expect(sortByPriority(null)).toEqual([]);
    expect(sortByPriority(undefined)).toEqual([]);
  });
});

describe('turning API data into objects: toTasks, toUsers, linkTasksToUsers', () => {
  const rawTasks = [
    { id: 1, title: 'one', completed: false, userId: 1 },
    { id: 2, title: 'two', completed: true, userId: 1 },
    { id: 4, title: 'four', completed: false, userId: 2 },
  ];

  test('toTasks makes PriorityTasks and works out priority, category and due date from the id', () => {
    const [first, second, third] = toTasks(rawTasks);
    expect(first).toBeInstanceOf(PriorityTask);
    expect([first.priority, second.priority, third.priority]).toEqual(['medium', 'low', 'high']);
    expect(first.category).toBe(CATEGORIES[1]);
    // id 1 -> due 1 + (1 % 14) - 7 = 6 days ago; id 4 -> 3 days ago
    expect(first.dueDate).toEqual(new Date(2026, 9, 9));
    expect(third.dueDate).toEqual(new Date(2026, 9, 12));
  });

  test('toTasks and toUsers skip malformed records and non-lists', () => {
    expect(ids(toTasks([null, 'text', { title: 'no id' }, { id: 'x' }, { id: 7 }]))).toEqual([7]);
    expect(toTasks(null)).toEqual([]);
    expect(toUsers({ not: 'a list' })).toEqual([]);
    expect(toUsers([{ id: 1, name: 'Ana' }, { name: 'no id' }])).toHaveLength(1);
  });

  test('linkTasksToUsers gives each user their own tasks and can be run again without doubling', () => {
    const userMap = buildUserMap(toUsers([{ id: 1, name: 'Ana' }, { id: 2, name: 'Ben' }]));
    const taskList = toTasks(rawTasks);

    linkTasksToUsers(taskList, userMap);
    linkTasksToUsers(taskList, userMap);

    expect(ids(userMap.get(1).tasks)).toEqual([1, 2]);
    expect(userMap.get(1).getCompletionRate()).toBe(50);
    expect(ids(userMap.get(2).tasks)).toEqual([4]);
  });

  test('getUniqueUserIds and getUniqueCategories return Sets with no duplicates', () => {
    expect(getUniqueUserIds(tasks)).toEqual(new Set([1, 2, 3]));
    const many = toTasks(Array.from({ length: 30 }, (_, i) => ({ id: i + 1, userId: 1 })));
    expect(getUniqueCategories(many)).toEqual(new Set(CATEGORIES));
  });
});

describe('markCompleted', () => {
  test('returns a new list with a completed, low-priority copy of the task', () => {
    const updated = markCompleted(tasks, 4);
    const task = updated.find((t) => t.id === 4);
    expect(task.completed).toBe(true);
    expect(task.priority).toBe('low');
    expect(task).not.toBe(tasks[3]);
  });

  test('leaves the original list and the other tasks untouched', () => {
    const updated = markCompleted(tasks, 4);
    expect(tasks[3].completed).toBe(false);
    expect(updated[0]).toBe(tasks[0]);
  });

  test('changes nothing for an unknown id or an already completed task', () => {
    const updated = markCompleted(tasks, 2);
    expect(updated[1]).toBe(tasks[1]);
    expect(markCompleted(tasks, 99)).toEqual(tasks);
  });
});

describe('input helpers: isValidId, parseIds, createCounter', () => {
  test('isValidId accepts positive whole numbers only', () => {
    ['1', '25', '200'].forEach((text) => expect(isValidId(text)).toBe(true));
    ['abc', '0', '-1', '1.5', '0x4', '1e0', '', ' 3'].forEach((text) => expect(isValidId(text)).toBe(false));
  });

  test('parseIds turns valid ids into numbers, and rejects all of them if one is invalid', () => {
    expect(parseIds(['1', '3'])).toEqual({ ids: [1, 3], invalid: [] });
    expect(parseIds(['abc', '5'])).toEqual({ ids: [], invalid: ['abc'] });
  });

  test('each counter keeps its own private count', () => {
    const first = createCounter();
    const second = createCounter();
    first.increment();
    first.increment();
    second.increment();
    expect(first.current()).toBe(2);
    expect(second.current()).toBe(1);
  });
});
