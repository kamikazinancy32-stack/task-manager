const taskList = document.querySelector('#task-list');
const notice = document.querySelector('#notice');
const searchInput = document.querySelector('#search-input');
const prioritySelect = document.querySelector('#priority-select');
const userSelect = document.querySelector('#user-select');
const sortButton = document.querySelector('#sort-button');
const statusButtons = [...document.querySelectorAll('[data-status]')];

const filters = { status: 'all', search: '', priority: '', userId: '', sort: '' };
let refreshTimer;
let busy = false;

const formatCount = (value) => new Intl.NumberFormat().format(value);

const showNotice = (message = '') => {
  notice.textContent = message;
  notice.hidden = !message;
};

const setBusy = (value) => {
  busy = value;
  taskList.setAttribute('aria-busy', String(value));
};

const appendText = (parent, tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
};

const renderSummary = (summary) => {
  document.querySelector('#total-count').textContent = formatCount(summary.total);
  document.querySelector('#completed-count').textContent = formatCount(summary.completed);
  document.querySelector('#pending-count').textContent = formatCount(summary.pending);
  document.querySelector('#overdue-count').textContent = formatCount(summary.overdue);
};

const fillUsers = (users) => {
  const selected = userSelect.value;
  const options = [new Option('Everyone', '')];
  for (const user of users) options.push(new Option(user.name, String(user.id)));
  userSelect.replaceChildren(...options);
  if ([...userSelect.options].some(({ value }) => value === selected)) userSelect.value = selected;
};

const renderTasks = (tasks) => {
  taskList.replaceChildren();
  document.querySelector('#visible-count').textContent = `(${tasks.length})`;

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    appendText(empty, 'strong', '', 'Nothing on this list');
    appendText(empty, 'span', '', 'Try another filter or search term.');
    taskList.append(empty);
    return;
  }

  for (const task of tasks) {
    const row = document.createElement('article');
    row.className = `task-row${task.completed ? ' is-complete' : ''}`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'task-check';
    toggle.setAttribute('aria-label', `${task.completed ? 'Reopen' : 'Complete'} task ${task.id}: ${task.title}`);
    toggle.setAttribute('aria-pressed', String(task.completed));
    const mark = appendText(toggle, 'span', 'check-mark', task.completed ? '✓' : '');
    mark.setAttribute('aria-hidden', 'true');
    toggle.addEventListener('click', () => updateTask(task, !task.completed));
    row.append(toggle);

    const main = document.createElement('div');
    main.className = 'task-main';
    appendText(main, 'span', 'task-title', task.title);
    appendText(main, 'span', 'task-id', `TASK ${String(task.id).padStart(3, '0')}`);
    row.append(main);

    const status = appendText(row, 'span', `task-status status-${task.status}`, task.status);
    status.setAttribute('aria-label', `Status: ${task.status}`);
    const priority = appendText(row, 'span', `priority-chip priority-${task.priority}`, `${task.priority} priority`);
    priority.setAttribute('aria-label', `Priority: ${task.priority}`);
    const owner = document.createElement('span');
    owner.className = 'task-owner';
    appendText(owner, 'span', '', 'ASSIGNED TO');
    owner.append(document.createTextNode(task.user.name));
    row.append(owner);
    taskList.append(row);
  }
};

const refresh = async () => {
  setBusy(true);
  showNotice();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  try {
    const response = await fetch(`/api/tasks?${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load the task list.');
    renderSummary(payload.summary);
    fillUsers(payload.users);
    renderTasks(payload.tasks);
  } catch (error) {
    taskList.replaceChildren();
    document.querySelector('#visible-count').textContent = '';
    showNotice(`${error.message} Check your connection and try again.`);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'sort-button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', refresh);
    taskList.append(retry);
  } finally {
    setBusy(false);
  }
};

const updateTask = async (task, completed) => {
  if (busy) return;
  setBusy(true);
  showNotice();
  try {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not update that task.');
    await refresh();
  } catch (error) {
    showNotice(`${error.message} Your change was not applied.`);
    setBusy(false);
  }
};

statusButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filters.status = button.dataset.status;
    statusButtons.forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    refresh();
  });
});

searchInput.addEventListener('input', () => {
  filters.search = searchInput.value;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 180);
});

prioritySelect.addEventListener('change', () => {
  filters.priority = prioritySelect.value;
  refresh();
});

userSelect.addEventListener('change', () => {
  filters.userId = userSelect.value;
  refresh();
});

sortButton.addEventListener('click', () => {
  filters.sort = filters.sort ? '' : 'title';
  sortButton.setAttribute('aria-pressed', String(Boolean(filters.sort)));
  sortButton.lastChild.textContent = filters.sort ? ' Sorted A-Z' : ' Sort by title';
  refresh();
});

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date()).toUpperCase();

refresh();