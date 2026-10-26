import { Task, PriorityTask, User } from '../../models.js';

// "Today" in every date test is 15 October 2026, 10:00 local time
const TODAY = new Date(2026, 9, 15, 10, 0);
const YESTERDAY = new Date(2026, 9, 14);
const TOMORROW = new Date(2026, 9, 16);

describe('Task', () => {
  let task;

  beforeEach(() => {
    task = new Task({ id: 1, title: 'Write report', userId: 7, category: 'work' });
  });

  describe('constructor', () => {
    test('stores the values it is given', () => {
      expect(task).toMatchObject({
        id: 1,
        title: 'Write report',
        completed: false,
        userId: 7,
        category: 'work',
      });
    });

    test('uses default values when called with no data', () => {
      const empty = new Task();
      expect(empty.title).toBe('Untitled task');
      expect(empty.completed).toBe(false);
      expect(empty.category).toBe('general');
      expect(empty.id).toBeUndefined();
    });

    test('treats null data like an empty object instead of crashing', () => {
      const fromNull = new Task(null);
      expect(fromNull.title).toBe('Untitled task');
      expect(fromNull.completed).toBe(false);
      expect(fromNull.category).toBe('general');
    });

    test('uses the default title when the title is null, undefined or not text', () => {
      expect(new Task({ title: null }).title).toBe('Untitled task');
      expect(new Task({ title: undefined }).title).toBe('Untitled task');
      expect(new Task({ title: 42 }).title).toBe('Untitled task');
    });

    test('only counts completed as true when it is exactly true', () => {
      expect(new Task({ completed: true }).completed).toBe(true);
      expect(new Task({ completed: 'yes' }).completed).toBe(false);
      expect(new Task({ completed: 1 }).completed).toBe(false);
      expect(new Task({ completed: null }).completed).toBe(false);
    });
  });

  describe('toggle()', () => {
    test('switches completed on and off', () => {
      task.toggle();
      expect(task.isCompleted()).toBe(true);
      task.toggle();
      expect(task.isCompleted()).toBe(false);
    });

    test('returns the same task so calls can be chained', () => {
      expect(task.toggle()).toBe(task);
    });
  });

  describe('getStatus()', () => {
    test('is "pending" for an unfinished task and "completed" after toggle()', () => {
      expect(task.getStatus()).toBe('pending');
      expect(task.toggle().getStatus()).toBe('completed');
    });
  });

  describe('isOverdue()', () => {
    test('is always false, because a plain Task has no due date', () => {
      const withDateData = new Task({ id: 2, dueDate: new Date(2000, 0, 1) });
      expect(task.isOverdue()).toBe(false);
      expect(withDateData.isOverdue()).toBe(false);
      expect(withDateData.dueDate).toBeUndefined();
    });
  });

  describe('describe()', () => {
    test('shows a box, the id and the title', () => {
      expect(task.describe()).toBe('[ ] #1 Write report');
      expect(task.toggle().describe()).toBe('[x] #1 Write report');
    });
  });
});

describe('PriorityTask', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('inheritance', () => {
    test('is an instance of both PriorityTask and Task', () => {
      const task = new PriorityTask({ id: 1 }, 'high');
      expect(task).toBeInstanceOf(PriorityTask);
      expect(task).toBeInstanceOf(Task);
    });

    test('keeps the Task fields and parent methods', () => {
      const task = new PriorityTask({ id: 3, title: 'Plan sprint', userId: 2 }, 'low');
      expect(task.title).toBe('Plan sprint');
      expect(task.userId).toBe(2);
      expect(task.isCompleted()).toBe(false);
      expect(Object.hasOwn(PriorityTask.prototype, 'isCompleted')).toBe(false);
    });

    test('treats null data like an empty object instead of crashing', () => {
      const task = new PriorityTask(null, 'high');
      expect(task.title).toBe('Untitled task');
      expect(task.priority).toBe('high');
      expect(task.dueDate).toBeNull();
    });
  });

  describe('priority', () => {
    test('stores a valid priority and ranks it low=1, medium=2, high=3', () => {
      expect(new PriorityTask({}, 'low').getRank()).toBe(1);
      expect(new PriorityTask({}, 'medium').getRank()).toBe(2);
      expect(new PriorityTask({}, 'high').getRank()).toBe(3);
    });

    test('falls back to "medium" for a missing or unknown priority', () => {
      expect(new PriorityTask({}).priority).toBe('medium');
      expect(new PriorityTask({}, 'urgent').priority).toBe('medium');
      expect(new PriorityTask({}, 'HIGH').priority).toBe('medium');
      expect(new PriorityTask({}, null).priority).toBe('medium');
    });
  });

  describe('due date', () => {
    test('accepts a Date or date text', () => {
      expect(new PriorityTask({ dueDate: TOMORROW }).dueDate).toEqual(TOMORROW);
      expect(new PriorityTask({ dueDate: '2026-10-16T00:00:00' }).dueDate).toEqual(TOMORROW);
    });

    test('is null when the due date is missing, empty or not a real date', () => {
      expect(new PriorityTask({}).dueDate).toBeNull();
      expect(new PriorityTask({ dueDate: '' }).dueDate).toBeNull();
      expect(new PriorityTask({ dueDate: 'not a date' }).dueDate).toBeNull();
    });
  });

  describe('toggle() (overridden)', () => {
    test('marks the task done and sets the priority to "low"', () => {
      const task = new PriorityTask({ id: 2 }, 'high');
      expect(task.toggle()).toBe(task);
      expect(task.completed).toBe(true);
      expect(task.priority).toBe('low');
    });

    test('re-applies the priority rule when un-completed (even id = high, odd id = medium)', () => {
      const even = new PriorityTask({ id: 2, completed: true }, 'low');
      const odd = new PriorityTask({ id: 3, completed: true }, 'low');
      expect(even.toggle().priority).toBe('high');
      expect(odd.toggle().priority).toBe('medium');
    });
  });

  describe('isOverdue() and getStatus() (overridden)', () => {
    test('a pending task due in the past is overdue', () => {
      const task = new PriorityTask({ id: 1, dueDate: YESTERDAY });
      expect(task.isOverdue()).toBe(true);
      expect(task.getStatus()).toBe('overdue');
    });

    test('a task due today or in the future is not overdue', () => {
      const dueToday = new PriorityTask({ id: 1, dueDate: new Date(2026, 9, 15) });
      const dueTomorrow = new PriorityTask({ id: 2, dueDate: TOMORROW });
      expect(dueToday.isOverdue()).toBe(false);
      expect(dueTomorrow.isOverdue()).toBe(false);
      expect(dueTomorrow.getStatus()).toBe('pending');
    });

    test('a task with no due date is never overdue', () => {
      expect(new PriorityTask({ id: 1 }).isOverdue()).toBe(false);
    });

    test('a completed task is not overdue, even if its due date has passed', () => {
      const task = new PriorityTask({ id: 1, completed: true, dueDate: YESTERDAY });
      expect(task.isOverdue()).toBe(false);
      expect(task.getStatus()).toBe('completed');
    });

    test('can be checked against a different "today" passed in', () => {
      const task = new PriorityTask({ id: 1, dueDate: TOMORROW });
      expect(task.isOverdue(new Date(2026, 9, 20))).toBe(true);
      expect(task.getStatus(new Date(2026, 9, 20))).toBe('overdue');
    });
  });

  describe('describe() (overridden)', () => {
    test('adds the priority and the due date to the Task description', () => {
      const task = new PriorityTask({ id: 5, title: 'Test', dueDate: new Date(2026, 0, 9) }, 'low');
      expect(task.describe()).toBe('[ ] #5 Test (low, due 2026-01-09)');
    });

    test('leaves out the due date when there is none', () => {
      expect(new PriorityTask({ id: 5, title: 'Test' }, 'high').describe()).toBe('[ ] #5 Test (high)');
    });
  });
});

describe('User', () => {
  let user;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(TODAY);
    user = new User({
      id: 1,
      name: 'Ana',
      username: 'ana',
      email: 'ana@example.com',
      address: { city: 'Kigali' },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('stores the user details and starts with no tasks', () => {
      expect(user).toMatchObject({ id: 1, name: 'Ana', username: 'ana', city: 'Kigali', tasks: [] });
    });

    test('uses default values when data is missing', () => {
      const empty = new User();
      expect(empty.name).toBe('Unknown user');
      expect(empty.username).toBe('unknown');
      expect(empty.email).toBe('no email');
      expect(empty.city).toBe('Unknown city');
    });

    test('treats null data like an empty object instead of crashing', () => {
      const fromNull = new User(null);
      expect(fromNull.name).toBe('Unknown user');
      expect(fromNull.tasks).toEqual([]);
    });
  });

  describe('addTask()', () => {
    test('adds Task and PriorityTask objects and can be chained', () => {
      const first = new Task({ id: 1 });
      const second = new PriorityTask({ id: 2 });
      expect(user.addTask(first).addTask(second)).toBe(user);
      expect(user.tasks).toEqual([first, second]);
    });

    test('throws a clear error for null or undefined', () => {
      expect(() => user.addTask(null)).toThrow('addTask() needs a Task object.');
      expect(() => user.addTask(undefined)).toThrow('addTask() needs a Task object.');
    });

    test('throws a clear error for a plain object that is not a Task', () => {
      expect(() => user.addTask({ id: 1, completed: true })).toThrow('addTask() needs a Task object.');
    });

    test('does not add anything when it throws', () => {
      expect(() => user.addTask(null)).toThrow();
      expect(user.tasks).toHaveLength(0);
      expect(user.getCompletionRate()).toBe(0);
    });
  });

  describe('getCompletionRate()', () => {
    test('returns 0 (not NaN) for a user with no tasks', () => {
      expect(user.getCompletionRate()).toBe(0);
    });

    test('returns 0 when no tasks are done', () => {
      user.addTask(new Task({ id: 1 })).addTask(new Task({ id: 2 }));
      expect(user.getCompletionRate()).toBe(0);
    });

    test('returns 100 when every task is done', () => {
      user.addTask(new Task({ id: 1, completed: true })).addTask(new Task({ id: 2, completed: true }));
      expect(user.getCompletionRate()).toBe(100);
    });

    test('returns a rounded percentage for a mix of done and not done', () => {
      user
        .addTask(new Task({ id: 1, completed: true }))
        .addTask(new Task({ id: 2 }))
        .addTask(new Task({ id: 3 }));
      expect(user.getCompletionRate()).toBe(33);
    });
  });

  describe('getTasksByStatus()', () => {
    beforeEach(() => {
      user
        .addTask(new PriorityTask({ id: 1, completed: true }))
        .addTask(new PriorityTask({ id: 2, dueDate: TOMORROW }))
        .addTask(new PriorityTask({ id: 3, dueDate: YESTERDAY }))
        .addTask(new Task({ id: 4 }));
    });

    test('returns only the completed tasks', () => {
      expect(user.getTasksByStatus('completed').map((t) => t.id)).toEqual([1]);
    });

    test('returns only the pending tasks (not the overdue ones)', () => {
      expect(user.getTasksByStatus('pending').map((t) => t.id)).toEqual([2, 4]);
    });

    test('returns only the overdue tasks', () => {
      expect(user.getTasksByStatus('overdue').map((t) => t.id)).toEqual([3]);
    });

    test('returns an empty list for an unknown status', () => {
      expect(user.getTasksByStatus('archived')).toEqual([]);
      expect(user.getTasksByStatus()).toEqual([]);
    });
  });

  describe('describe()', () => {
    test('shows the name, username, email and city', () => {
      expect(user.describe()).toBe('Ana (@ana) - ana@example.com, Kigali');
    });
  });
});
