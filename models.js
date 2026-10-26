export const PRIORITIES = ['low', 'medium', 'high'];

// JSONPlaceholder has no priority field, so we work one out from the task itself
export const pickPriority = ({ id, completed }) => {
  if (completed) return 'low';
  return id % 2 === 0 ? 'high' : 'medium';
};

// Turns a Date or date text into a Date, or null if it is missing or not a real date
const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Shows a date as YYYY-MM-DD using the computer's local time
export const formatDate = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export class Task {
  // "data ?? {}" so that null works like no data at all (a "= {}" default only covers undefined)
  constructor(data) {
    const { id, title = 'Untitled task', completed = false, userId, category = 'general' } = data ?? {};
    this.id = id;
    this.title = typeof title === 'string' ? title : 'Untitled task';
    this.completed = completed === true;
    this.userId = userId;
    this.category = category;
  }

  isCompleted() {
    return this.completed;
  }

  // Switches between done and not done
  toggle() {
    this.completed = !this.completed;
    return this;
  }

  // A basic Task has no due date, so it can never be overdue. PriorityTask overrides this.
  isOverdue() {
    return false;
  }

  getStatus() {
    return this.completed ? 'completed' : 'pending';
  }

  describe() {
    const box = this.completed ? '[x]' : '[ ]';
    return `${box} #${this.id} ${this.title}`;
  }
}

export class PriorityTask extends Task {
  constructor(data, priority = 'medium') {
    super(data);
    this.priority = PRIORITIES.includes(priority) ? priority : 'medium';
    this.dueDate = toDate(data?.dueDate);
  }

  getRank() {
    return PRIORITIES.indexOf(this.priority) + 1;
  }

  // Same as Task.toggle(), but also re-applies the priority rule,
  // so a completed task is always 'low'
  toggle() {
    super.toggle();
    this.priority = pickPriority(this);
    return this;
  }

  // Overdue = not finished, and the due date is before today
  isOverdue(today = new Date()) {
    if (this.completed || !this.dueDate) return false;
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return this.dueDate < startOfToday;
  }

  // Adds a third status, 'overdue', on top of Task's 'completed' and 'pending'
  getStatus(today = new Date()) {
    return this.isOverdue(today) ? 'overdue' : super.getStatus();
  }

  describe() {
    const due = this.dueDate ? `, due ${formatDate(this.dueDate)}` : '';
    return `${super.describe()} (${this.priority}${due})`;
  }
}

export class User {
  constructor(data) {
    const { id, name = 'Unknown user', username = 'unknown', email = 'no email', address } = data ?? {};
    this.id = id;
    this.name = name;
    this.username = username;
    this.email = email;
    this.city = address?.city ?? 'Unknown city';
    this.tasks = [];
  }

  // Only real tasks are accepted, so the other methods can always call task.isCompleted()
  addTask(task) {
    if (!(task instanceof Task)) {
      throw new Error('addTask() needs a Task object.');
    }
    this.tasks.push(task);
    return this;
  }

  // Percentage of this user's tasks that are done (0 if they have no tasks)
  getCompletionRate() {
    if (this.tasks.length === 0) return 0;
    const done = this.tasks.filter((task) => task.isCompleted()).length;
    return Math.round((done / this.tasks.length) * 100);
  }

  // status is 'completed', 'pending' or 'overdue' (see Task/PriorityTask getStatus)
  getTasksByStatus(status) {
    return this.tasks.filter((task) => task.getStatus() === status);
  }

  describe() {
    return `${this.name} (@${this.username}) - ${this.email}, ${this.city}`;
  }
}
