import readline from 'node:readline';
import { APIClient } from './api.js';
import { withReadableTitles } from './titles.js';
import { PRIORITIES } from './models.js';
import {
  toTasks,
  toUsers,
  getCompleted,
  getPending,
  filterByPriority,
  searchByTitle,
  filterByUsers,
  sortByTitle,
  sortByPriority,
  summarize,
  getUniqueUserIds,
  buildUserMap,
  userReport,
  markCompleted,
  createCounter,
  parseIds,
  getOverdue,
  getUniqueCategories,
  linkTasksToUsers,
} from './taskProcessor.js';

// What to tell the user for each kind of APIError (see api.js)
const ERROR_HINTS = {
  network: 'Check your internet connection, then try again.',
  timeout: 'The server is slow right now. Try again in a minute.',
  http: 'The API is having problems right now. Try again in a few minutes.',
  json: 'The API sent back data the app cannot read. Try again later.',
};

// Set DEBUG=1 to also see the full error and stack trace while developing
const printError = (intro, error) => {
  console.error(`${intro}: ${error.message}`);
  const hint = ERROR_HINTS[error.type];
  if (hint) console.error(hint);
  if (process.env.DEBUG) console.error(error);
};

const isExitCommand = (text) => ['exit', 'quit'].includes(text.toLowerCase());

const HELP = `
Commands:
  all                      show every task
  completed                show completed tasks
  pending                  show tasks that are not done yet
  overdue                  show unfinished tasks whose due date has passed
  priority [high|medium|low]
                           sort by priority, or show one priority level
  sort                     show tasks in A-Z order by title
  search <word>            find tasks with a word in the title
  user <id> [id ...]       show tasks for one or more users
  users                    list users and their progress
  complete <id>            mark a task as completed (this session only)
  summary                  show totals
  help                     show this list
  exit                     quit
`;

const printTasks = (tasks, userMap) => {
  if (tasks.length === 0) {
    console.log('No tasks to show.');
    return;
  }

  tasks.forEach((task) => {
    const owner = userMap.get(task.userId)?.name ?? `User ${task.userId}`;
    console.log(`${task.describe()} - ${owner}`);
  });

  console.log(`\n${tasks.length} task(s)`);
};

const printSummary = (tasks) => {
  const { total, completed, pending, byPriority } = summarize(tasks);
  const rate = total === 0 ? 0 : Math.round((completed / total) * 100);
  const { high, medium, low } = byPriority;

  console.log(`Total tasks:     ${total}`);
  console.log(`Completed:       ${completed} (${rate}%)`);
  console.log(`Pending:         ${pending}`);
  console.log(`Overdue:         ${getOverdue(tasks).length}`);
  console.log(`Priority:        high ${high}, medium ${medium}, low ${low}`);
  console.log(`Categories:      ${[...getUniqueCategories(tasks)].join(', ') || 'none'}`);
  console.log(`Users with tasks: ${getUniqueUserIds(tasks).size}`);
};

const printUsers = (tasks, userMap) => {
  if (userMap.size === 0) {
    console.log('No users loaded.');
    return;
  }

  userReport(tasks, userMap).forEach(({ id, name, total, completed }) => {
    const user = userMap.get(id);
    const details = user?.describe() ?? name;
    const rate = user?.getCompletionRate() ?? 0;
    const overdue = user?.getTasksByStatus('overdue').length ?? 0;
    console.log(`${id}. ${details} | ${completed}/${total} done (${rate}%), ${overdue} overdue`);
  });
};

const handleCommand = (line, state) => {
  const [command, ...args] = line.trim().split(/\s+/);
  const { tasks, userMap } = state;

  switch (command.toLowerCase()) {
    case 'all':
      printTasks(tasks, userMap);
      break;

    case 'completed':
      printTasks(getCompleted(tasks), userMap);
      break;

    case 'pending':
      printTasks(getPending(tasks), userMap);
      break;

    case 'overdue':
      printTasks(getOverdue(tasks), userMap);
      break;

    case 'priority': {
      const [level] = args;
      if (!level) {
        printTasks(sortByPriority(tasks), userMap);
      } else if (PRIORITIES.includes(level.toLowerCase())) {
        printTasks(filterByPriority(tasks, level.toLowerCase()), userMap);
      } else {
        console.log(`"${level}" is not a priority. Use one of: ${PRIORITIES.join(', ')}`);
      }
      break;
    }

    case 'sort':
      printTasks(sortByTitle(tasks), userMap);
      break;

    case 'search': {
      const word = args.join(' ');
      if (!word) {
        console.log('Usage: search <word>   e.g. search report');
        break;
      }
      printTasks(searchByTitle(tasks, word), userMap);
      break;
    }

    case 'user': {
      if (args.length === 0) {
        console.log('Usage: user <id> [id ...]   e.g. user 1 3');
        break;
      }
      const { ids, invalid } = parseIds(args);
      if (invalid.length > 0) {
        console.log(`Invalid user id: ${invalid.join(', ')}. Ids must be positive whole numbers, e.g. user 1 3`);
        break;
      }
      const unknown = ids.filter((id) => !userMap.has(id));
      if (unknown.length > 0) {
        console.log(`No user found with id: ${unknown.join(', ')}`);
      }
      printTasks(filterByUsers(tasks, ...ids), userMap);
      break;
    }

    case 'users':
      printUsers(tasks, userMap);
      break;

    case 'complete': {
      if (args.length !== 1) {
        console.log('Usage: complete <id>   e.g. complete 5 (one task id at a time)');
        break;
      }
      const { ids, invalid } = parseIds(args);
      if (invalid.length > 0) {
        console.log(`"${args[0]}" is not a valid task id. Use a positive whole number, e.g. complete 5`);
        break;
      }
      const [id] = ids;
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        console.log(`No task found with id ${id}.`);
      } else if (task.isCompleted()) {
        console.log(`Task #${id} is already completed.`);
      } else {
        state.tasks = markCompleted(tasks, id);
        linkTasksToUsers(state.tasks, userMap); // so each User's task list has the new copy
        console.log(`Task #${id} marked as completed for this session. Its priority is now low.`);
        console.log('Note: JSONPlaceholder is a fake API, so this change is not saved on the server.');
      }
      break;
    }

    case 'summary':
      printSummary(tasks);
      break;

    case 'help':
      console.log(HELP);
      break;

    default:
      console.log(`Unknown command "${command}". Type "help" to see what you can do.`);
  }
};

const loadData = async (client) => {
  const { tasks, users } = await client.getTasksAndUsers();
  // Swap Lorem Ipsum titles for English ones (see titles.js)
  const taskList = toTasks(withReadableTitles(tasks));
  const userMap = linkTasksToUsers(taskList, buildUserMap(toUsers(users)));
  return { tasks: taskList, userMap };
};

const startCli = async (state) => {
  const commands = createCounter();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log('Type "help" to see the commands.');
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (isExitCommand(input)) break;

    if (input) {
      commands.increment();
      // If one command crashes, report it and keep the CLI running
      try {
        handleCommand(input, state);
      } catch (error) {
        printError('That command failed', error);
      }
    }

    rl.prompt();
  }

  rl.close();
  console.log(`\nBye! You ran ${commands.current()} command(s).`);
};

const main = async () => {
  const client = new APIClient();
  console.log('Loading tasks and users from JSONPlaceholder...');

  let state;
  try {
    state = await loadData(client);
  } catch (error) {
    printError('Could not load data', error);
    process.exitCode = 1;
    return;
  }

  if (state.tasks.length === 0) {
    console.log('The API returned no tasks.');
  }
  console.log(`Loaded ${state.tasks.length} tasks and ${state.userMap.size} users.`);

  const oneOffCommand = process.argv.slice(2).join(' ');
  if (oneOffCommand) {
    // "node main.js exit" has nothing to do, so just stop
    if (!isExitCommand(oneOffCommand)) handleCommand(oneOffCommand, state);
    return;
  }

  await startCli(state);
};

// Catch anything unexpected, so it never becomes an unhandled promise rejection
main().catch((error) => {
  printError('Unexpected error', error);
  process.exitCode = 1;
});
