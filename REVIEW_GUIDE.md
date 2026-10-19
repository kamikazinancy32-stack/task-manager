# Task Manager API Client: Review Notes

## How to run

```
npm start
```
or `node main.js`. To run a single command and exit: `node main.js summary`, `node main.js user 1 3`.

To run the automated tests (no internet needed):
```
npm test
```

You need Node 18 or newer, because `fetch` is built into Node from version 18. I'm using Node v24. (The built-in test runner `node:test` is only marked "stable" from Node 20, so use Node 20+ for `npm test`.) No `npm install` is needed because there are no dependencies.

To see the full error and stack trace when something goes wrong, set `DEBUG`:
- PowerShell: `$env:DEBUG=1; node main.js` (turn it off again with `Remove-Item Env:DEBUG`)
- Git Bash: `DEBUG=1 node main.js`

---

## 1. Requirement checklist

| Requirement | Where |
|---|---|
| `let` / `const` | everywhere. `let` only in `api.js` `request()` (`response`), `main.js` `main()` (`state`), `taskProcessor.js` `createCounter()` (`count`) |
| Arrow functions | all of `taskProcessor.js`, the helpers in `main.js` |
| Destructuring | `Task`/`User` constructors, `filterByUsers`, `userReport`, `printSummary`, `handleCommand`, `getTasksAndUsers` |
| Spread | `sortByTitle`, `sortByPriority` (`[...tasks]`), `markCompleted` (`{ ...task }`), `userReport` (`[...map]`), `handleCommand` (`...ids`) |
| Rest | `filterByUsers(tasks, ...userIds)`, `const [command, ...args]` in `handleCommand` |
| ES modules | `import`/`export` in all four source files and the test files, `"type": "module"` in `package.json` |
| `forEach` | `groupByUser`, `printTasks`, `printUsers` |
| `map` | `toTasks`, `toUsers`, `markCompleted`, `userReport`, `buildUserMap`, `parseIds` |
| `filter` | `getCompleted`, `getPending`, `filterByPriority`, `searchByTitle`, `filterByUsers`, `parseIds` |
| `reduce` | `countCompleted`, `summarize` |
| `sort` | `sortByTitle`, `sortByPriority`, `userReport` |
| async/await | `APIClient.request`, `getTasksAndUsers`, `createCachedRequest`, `main.js` `loadData`, `main`, `startCli` |
| Promise-based (`.then()`) style | `APIClient.fetchUserTodos`, `main().catch(...)` |
| `fetchUserTodos(userId)` | `APIClient.fetchUserTodos` in `api.js` |
| Task methods `toggle()`, `isOverdue()`, `getStatus()` | `Task` in `models.js`, overridden in `PriorityTask` |
| `PriorityTask` with `priority`, `dueDate` and overrides | `models.js`: overrides `toggle`, `isOverdue`, `getStatus`, `describe` |
| User methods `addTask()`, `getCompletionRate()`, `getTasksByStatus()` | `User` in `models.js`; filled by `linkTasksToUsers`, shown by `users` |
| Timeout | `AbortSignal.timeout` in `APIClient.request` (5 seconds) |
| Malformed / empty data | `toTasks` / `toUsers` skip bad records; `Task`, `User`, `PriorityTask` constructors use safe fallbacks |
| `Promise.all` | `APIClient.getTasksAndUsers` |
| Network, timeout, HTTP and JSON errors | `APIClient.request` throws an `APIError` with a `type`; `main.js` `printError` shows a matching hint |
| Unexpected errors | `try/catch` around each command in `startCli`, and `main().catch(...)` at the bottom of `main.js` |
| Input validation | `isValidId` / `parseIds` in `taskProcessor.js`, checks in each `case` of `handleCommand` |
| Classes | `APIClient`, `APIError`, `Task`, `PriorityTask`, `User` |
| `extends` / `super()` | `PriorityTask extends Task` in `models.js`, `APIError extends Error` in `api.js` |
| `Map` | `buildUserMap`, `groupByUser` |
| `Set` | `getUniqueCategories` (unique categories), `getUniqueUserIds`, `filterByUsers` |
| Closure | `createCachedRequest` in `api.js` (caches API answers), `createCounter` (used in `main.js` `startCli`) |
| CLI | `main.js` `handleCommand`, `startCli` |
| Automated tests | `test/taskProcessor.test.js`, `test/models.test.js`, `test/api.test.js` (run with `npm test`) |

---

## 2. Why each file exists

- **api.js** talks to the internet and does nothing else. If the API URL changes, this is the only file I edit.
- **models.js** describes what a Task, PriorityTask and User *are*. It has no network code and does no printing.
- **taskProcessor.js** holds the "brain": filtering, sorting, counting. Every function takes data in and gives new data back. Nothing in this file prints or fetches. That makes the functions easy to test.
- **main.js** is the boss. It imports from the other three, loads the data, reads what the user types, and prints results.
- **test/** holds the automated tests. They use Node's built-in `node:test` and `node:assert`, so nothing extra is installed. They use small made-up data and a fake `fetch`, so they never need the internet.

Import direction (one way only, so there are no circular imports):

```
main.js ──► api.js
   │
   ├──────► taskProcessor.js ──► models.js
   └──────────────────────────► models.js  (PRIORITIES)
```

## 3. What happens when you run `node main.js`

1. `main()` creates `new APIClient()`.
2. `loadData()` calls `client.getTasksAndUsers()`. It sends **two requests at the same time** with `Promise.all` (`/todos` and `/users`).
3. If either request fails, the error is caught in `main()`. `printError` prints "Could not load data: ..." plus a hint that matches the kind of problem (network, HTTP or bad JSON), sets exit code 1, and stops.
4. The raw JSON is turned into objects. `toTasks()` makes `PriorityTask` objects (each gets a priority), and `toUsers()` makes `User` objects.
5. `buildUserMap()` puts the users in a `Map` so that `userId → User` lookups are fast.
6. Everything is kept in `state = { tasks, userMap }`.
7. If a command was typed after `node main.js`, it runs once and the program exits. If not, the readline loop starts.
8. Every line you type goes to `handleCommand()`. It splits the line into a command and its arguments, checks the arguments (for ids it uses `parseIds`), calls the right function in `taskProcessor.js`, and prints the result. If a command crashes unexpectedly, the `try/catch` in `startCli` prints "That command failed: ..." and the CLI keeps running.
9. When you type `exit` or `quit` (in any capitals, e.g. `EXIT`), the loop stops and prints how many commands you ran (that number comes from the closure).
10. `main()` is an async function, so it returns a Promise. `main().catch(...)` at the bottom catches anything unexpected, so it can never become an "unhandled promise rejection".

---

## 4. Concepts, one by one

### `let` vs `const` (and why not `var`)
1. **Simple:** `const` = this name will always point to the same thing. `let` = I'm going to reassign it later.
2. **Where:** `let count` in `createCounter`, `let response` in `APIClient.request`, `let state` in `main`. Everything else is `const`.
3. **Example:**
   ```js
   let response;
   try {
     response = await fetch(`${this.baseUrl}${endpoint}`);
   } catch (error) { ... }
   ```
4. **Why:** `response` has to be declared *outside* the `try` so I can use it after. It gets its value *inside*, so it must be `let`. `var` is function-scoped and gets "hoisted", which means you can use it before the line that declares it and it quietly holds `undefined`. That causes confusing bugs. `let`/`const` are block-scoped, and they throw an error if you use them too early.
5. **If changed:** if I make `count` a `const`, then `++count` throws `TypeError: Assignment to constant variable`.
6. **Say:** "I use `const` by default and `let` only when the value really changes. I don't use `var` because its function scope and hoisting cause bugs."

Watch out: `const` does **not** freeze an object. `const totals = {...}; totals.total += 1` still works. You just can't do `totals = somethingElse`.

### Arrow functions
1. **Simple:** a shorter way to write a function. If the body is a single expression, its result is returned automatically.
2. **Where:** every function in `taskProcessor.js`.
3. **Example:** `export const getPending = (tasks) => tasks.filter((task) => !task.isCompleted());`
4. **Why:** short callbacks are much easier to read this way. Arrow functions also don't have their own `this`, so inside a class method they use the class's `this`. I still used normal method syntax inside classes, because methods need `this` to be the object.
5. **If changed:** writing `function (tasks) { return ... }` works exactly the same here. It's just longer.
6. **Say:** "Arrow functions keep the callbacks short. Class methods use normal method syntax because they need `this`."

### Destructuring
1. **Simple:** pulling values out of an object or array into variables in one line.
2. **Where:** `Task` constructor, `filterByUsers`, `printSummary`, `handleCommand`, `getTasksAndUsers`, `userReport`.
3. **Examples:**
   ```js
   constructor({ id, title = 'Untitled task', completed = false, userId } = {})
   const [tasks, users] = await Promise.all([...]);
   const { total, completed, pending, byPriority } = summarize(tasks);
   const [command, ...args] = line.trim().split(/\s+/);
   ```
4. **Why:** instead of writing `data.id`, `data.title` over and over, I name the parts I need. In the constructor I can also add **default values** (`title = 'Untitled task'`). The `= {}` at the end means `new Task()` with no data doesn't crash.
5. **If removed:** if I remove `= {}`, `new Task()` throws "Cannot destructure property 'id' of 'undefined'".
6. **Say:** "Destructuring lets me take only the fields I need, and lets me set defaults when data is missing."

### Spread vs rest
They are both written `...`, but they do opposite jobs.
- **Spread** *unpacks* things: `[...tasks]` copies an array, `{ ...task, completed: true }` copies an object and changes one field, `filterByUsers(tasks, ...ids)` turns an array into separate arguments.
- **Rest** *collects* things: `(tasks, ...userIds)` gathers all the extra arguments into an array, and `[command, ...args]` gathers "everything else".

Quick way to remember: **spread is used where values go *out* (calls, array/object literals). Rest is used where names are *created* (parameters, destructuring).**

**Where spread matters most: `sortByTitle`**
```js
export const sortByTitle = (tasks) => [...tasks].sort((a, b) => a.title.localeCompare(b.title));
```
`sort()` **changes the original array**. Without `[...tasks]`, typing `sort` would permanently reorder the main task list, and `all` would show the sorted order afterwards. The test "sortByTitle sorts A-Z without changing the original array" in `test/taskProcessor.test.js` checks this.

**Where rest matters most: `filterByUsers`**
```js
export const filterByUsers = (tasks, ...userIds) => {
  const wanted = new Set(userIds);
  return tasks.filter(({ userId }) => wanted.has(userId));
};
```
The user can type `user 1` or `user 1 3 7`, so I don't know how many ids will come. Rest collects however many there are.

**Say:** "Spread copies so I don't change the original data. Rest collects a variable number of arguments into an array."

### `map()` vs `forEach()`
1. **Simple:** `map` makes a **new array** with one result for each item. `forEach` just *does something* for each item and returns `undefined`.
2. **Where:** `map` is in `toTasks`, `toUsers`, `markCompleted`, `userReport`. `forEach` is in `groupByUser` and `printTasks`.
3. **Example:**
   ```js
   export const toTasks = (rawTasks = []) => rawTasks.map((raw) => new PriorityTask(raw, pickPriority(raw)));
   tasks.forEach((task) => console.log(...));
   ```
4. **Why:** use `map` when I want the results, and `forEach` when I'm doing a side effect (printing, or filling a Map).
5. **If swapped:** `const x = tasks.forEach(...)` would make `x` equal `undefined`.
6. **Say:** "map transforms and returns a new array. forEach is just for actions like printing."

### `filter()`, `reduce()`, `sort()`
- **filter** keeps the items where the callback returns `true`. `getPending` keeps tasks that are not completed. It returns a new array, and the original is untouched.
- **reduce** walks through the array carrying a running value (the "accumulator") and finishes with **one** result.
  ```js
  tasks.reduce((count, task) => (task.isCompleted() ? count + 1 : count), 0);
  ```
  The `0` is the starting value. If I leave it out on an empty array, `reduce` throws `TypeError: Reduce of empty array with no initial value`. `summarize` builds a whole object in a single pass.
- **sort** uses a compare function `(a, b)`. A negative result puts `a` first, a positive result puts `b` first.
  ```js
  [...tasks].sort((a, b) => b.getRank() - a.getRank() || a.id - b.id);
  ```
  `b - a` sorts from high to low. If the ranks are equal, the result is `0`, which is "falsy", so `||` moves on and sorts by id instead. Without a compare function, `sort()` compares items as **strings**, so `[10, 9, 1]` becomes `[1, 10, 9]`.

**Say:** "filter selects, reduce turns many items into one result, and sort reorders. I always copy before sorting because sort changes the array in place."

### Promises vs async/await
1. **Simple:** a Promise is a "I'll give you the value later" object. `async/await` is a cleaner way to wait for one, so the code reads top to bottom.
2. **Where:** `APIClient.request`, `getTasksAndUsers`, `loadData`, `main`.
3. **Same thing written two ways:**
   ```js
   // .then style
   fetch(url).then((res) => res.json()).then((data) => ...).catch(...)
   // my style
   const response = await fetch(url);
   return response.json();
   ```
4. **Why:** `await` works with normal `try/catch`, and that's easier to follow than chained `.then().catch()`.
5. **If I forget `await`:** `response` would be a Promise, not a Response, so `response.ok` would be `undefined` and the check would wrongly throw.
6. **Say:** "async/await is built on Promises. It just makes asynchronous code look like normal step-by-step code."

### `Promise.all()`
```js
async getTasksAndUsers() {
  const [tasks, users] = await Promise.all([this.getTasks(), this.getUsers()]);
  return { tasks, users };
}
```
- Both requests **start right away** and run at the same time. Total wait ≈ the slower of the two, not both added together.
- Results come back **in the same order as the array**, not in the order they finish.
- **If one rejects:** `Promise.all` rejects immediately with that error, and you get **none** of the results. That's fine here, because the app is useless without either tasks or users. (`Promise.allSettled` would give you each result separately, if you needed partial data.)
- Tested in `test/api.test.js`: "getTasksAndUsers rejects if one of the two requests fails (Promise.all)".

**Say:** "Tasks and users don't depend on each other, so I fetch them together. If either one fails, the whole load fails and main.js shows the error."

### `fetch()`, `response.ok`: network, HTTP and JSON errors
```js
try {
  response = await fetch(`${this.baseUrl}${endpoint}`);
} catch (error) {
  throw new APIError(`Could not reach the server for ${endpoint}.`, 'network', error);
}
if (!response.ok) {
  throw new APIError(`The server answered ${endpoint} with error status ${response.status}.`, 'http');
}
try {
  return await response.json();
} catch (error) {
  throw new APIError(`The server sent data for ${endpoint} that is not valid JSON.`, 'json', error);
}
```
There are three different things that can go wrong:
- **Network error:** the server couldn't be reached at all (no internet, wrong host). `fetch` *rejects*, and the first `catch` handles it. Type `'network'`.
- **HTTP error:** the server answered, but with 404 or 500. **`fetch` does NOT reject for these.** It resolves normally with `ok: false`. That's why I check `response.ok` (true for status 200–299). Without the check, a 404 would be treated like data. Type `'http'`.
- **Bad JSON:** the server answered "OK" but sent something that isn't JSON (for example an HTML error page). `response.json()` rejects. Type `'json'`.

`APIError` is my own error class (`class APIError extends Error`). It is a normal `Error` with one extra field, `type`. In `main.js`, `printError` uses `type` to choose the right hint, so users are only told to "check your internet connection" when it really is a network problem:
```js
const ERROR_HINTS = {
  network: 'Check your internet connection, then try again.',
  http: 'The API is having problems right now. Try again in a few minutes.',
  json: 'The API sent back data the app cannot read. Try again later.',
};
```
The original error is kept as `cause`, and is printed (with the stack trace) only when `DEBUG` is set. That keeps the normal message simple but still lets me debug.

**Why `return await` and not just `return`?** A `try/catch` only catches errors that happen *inside* it. `return response.json()` hands the Promise back straight away, so if it fails later, the error escapes the `catch`. `return await` waits inside the `try`, so the `catch` sees the error.

- Tested in `test/api.test.js` with a fake `fetch`: network failure → type `network`, 404 → type `http`, HTML instead of JSON → type `json`.

**Say:** "fetch only rejects on network failure. For HTTP errors I check response.ok myself, and I also catch bad JSON. Each one becomes an APIError with a type, so the user gets the right hint."

### Classes, constructors, instances, `extends`, `super()`
1. **Simple:** a class is a blueprint, and an instance is one thing built from it (`new Task(...)`). The constructor runs once when the instance is created and sets its properties.
2. **Where:** `models.js`, plus `APIClient` and `APIError` in `api.js`. (`APIError extends Error` is a second example of inheritance: it calls `super(message, { cause })` and adds a `type` field.)
3. **Example:**
   ```js
   export class PriorityTask extends Task {
     constructor(data, priority = 'medium') {
       super(data);
       this.priority = PRIORITIES.includes(priority) ? priority : 'medium';
     }
     getRank() { return PRIORITIES.indexOf(this.priority) + 1; }
     describe() { return `${super.describe()} (${this.priority})`; }
   }
   ```
4. **What it inherits:** `id`, `title`, `completed`, `userId`, and `isCompleted()`, all from `Task`.
   **What it adds:** `priority` and `getRank()`.
   **What it overrides:** `describe()`. It reuses the parent's text through `super.describe()` and adds the priority on the end.
5. **If I remove `super(data)`:** JavaScript throws `ReferenceError: Must call super constructor in derived class before accessing 'this'`. `super()` has to run before you touch `this`.
6. **Say:** "PriorityTask *is a* Task with one extra field. super(data) lets Task set up the shared fields, so I don't repeat that code."

**Why the priority is calculated:** JSONPlaceholder has no priority field. `pickPriority` gives it a value: completed tasks are `low`, and unfinished tasks are `high` or `medium` depending on whether the id is even or odd. That's a made-up rule, so say so honestly if you're asked. An invalid priority like `'urgent'` falls back to `'medium'`.

`markCompleted` uses the **same** `pickPriority` rule (through `PriorityTask.toggle()`), so a task you complete with `complete <id>` also becomes `low`:
```js
export const markCompleted = (tasks, id) =>
  tasks.map((task) =>
    task.id === id && !task.isCompleted()
      ? new PriorityTask({ ...task }, task.priority).toggle()
      : task
  );
```
(Before this fix it kept the old priority, so after `complete 1` the summary said 91 completed but only 90 low. Now both are 91.)

`User` uses `address?.city ?? 'Unknown city'`. `?.` stops safely if `address` is missing, and `??` gives a fallback when the value is `null` or `undefined`.

### Named exports and imports
```js
export class APIClient { ... }            // api.js
import { APIClient } from './api.js';     // main.js
```
- The name inside `{ }` must match the exported name exactly.
- In Node ES modules **you must write `.js`** in the import path.
- `"type": "module"` in `package.json` tells Node to treat `.js` files as ES modules. Without it, Node throws `Cannot use import statement outside a module`.
- I used named exports (not `export default`) because each file exports several things, and named imports make it clear exactly what's being used.

### `Map` vs a normal object
```js
export const buildUserMap = (users) => new Map(users.map((user) => [user.id, user]));
userMap.get(task.userId)?.name
```
- A Map keeps keys as their real type. `userId` is the number `1`, and `map.get(1)` works. An object turns every key into a string.
- It has `.size`, `.has()`, `.get()`, `.set()`, and you can loop over it directly.
- **Why not `users.find(...)` each time?** `printTasks` looks up an owner for every task: 200 tasks × searching 10 users. `Map.get` jumps straight to the answer.
- `groupByUser` uses a Map too: userId → that user's list of tasks.

### `Set` vs an array
```js
export const getUniqueUserIds = (tasks) => new Set(tasks.map(({ userId }) => userId));
```
- A Set **can't hold duplicates**. 200 tasks contain 10 different userIds, so the Set has size 10.
- `set.has(x)` is quick and reads clearly. In `filterByUsers` I put the wanted ids in a Set and check `wanted.has(userId)`.
- With an array I'd need something like `ids.filter((id, i) => ids.indexOf(id) === i)` to remove duplicates.

### Closures
```js
export const createCounter = () => {
  let count = 0;
  return {
    increment: () => ++count,
    current: () => count,
  };
};
```
1. **Simple:** a function that *remembers* the variables from the place where it was created, even after that outer function has finished.
2. **Where:** `taskProcessor.js` `createCounter`, used in `main.js` `startCli` to count the commands you type.
3. **How it works:** `createCounter()` runs and returns. Normally `count` would be gone after that, but `increment` and `current` still point to it, so JavaScript keeps it alive. Both functions share the **same** `count`.
4. **Why:** nothing outside can change `count` directly (it's private). Each call to `createCounter()` makes a brand new, separate `count`. That's tested: two counters stay independent.
5. **If `count` were a global variable:** any code could change it, and two counters would interfere with each other.
6. **Say:** "The inner functions close over `count`, so it stays alive and private between calls."

### CLI input and output
- `readline.createInterface({ input: process.stdin, output: process.stdout })` reads what the user types.
- `for await (const line of rl)` waits for each line. It also works when commands are piped in, which is how I tested it.
- `process.argv.slice(2)` gets anything typed after `node main.js`, so `node main.js summary` runs once and exits.
- `handleCommand` checks the input and decides which function to call. The actual work is done by functions in `taskProcessor.js`.
- Command names ignore capitals (`command.toLowerCase()`), and so do `exit` / `quit` (`isExitCommand`).
- Bad input never crashes the app. It always prints a helpful line: unknown command, `priority urgent`, `user abc`, `user 99`, `search` with no word, `complete 999`, `complete` on a task that's already done.

**Checking ids: `isValidId` and `parseIds`** (in `taskProcessor.js`, so they can be tested)
```js
export const isValidId = (text) => /^\d+$/.test(text) && Number(text) > 0;

export const parseIds = (args) => {
  const invalid = args.filter((arg) => !isValidId(arg));
  const ids = invalid.length === 0 ? args.map(Number) : [];
  return { ids, invalid };
};
```
- `/^\d+$/` is a regular expression meaning "from start (`^`) to end (`$`), only digits (`\d+`)". So `-1`, `1.5`, `0x4`, `1e0` and `abc` all fail.
- `Number(text) > 0` then rejects `0`.
- Why not just use `Number()`? Because `Number('0x4')` is `4` (hexadecimal) and `Number('1e0')` is `1` (scientific notation). They look valid to `Number`, but they aren't ids a user meant to type.
- If **any** id is bad, `ids` is empty and `invalid` lists the bad ones, so `handleCommand` can show them. Before this fix, bad ids were silently dropped, so `complete abc 5` completed task 5.
- `complete` now needs exactly one id: `complete abc 5` shows the usage message.

---

## 4b. Features added from the lab brief

### Task: `toggle()`, `isOverdue()`, `getStatus()`
```js
toggle() { this.completed = !this.completed; return this; }
isOverdue() { return false; }   // a plain Task has no due date
getStatus() { return this.completed ? 'completed' : 'pending'; }
```
`toggle()` returns `this`, so calls can be chained: `task.toggle().getStatus()`.

### PriorityTask: `dueDate` and meaningful overrides
`PriorityTask` adds `priority` and `dueDate`, and overrides four methods:
- **`toggle()`:** calls `super.toggle()`, then re-applies the priority rule (`pickPriority`). A completed task is always `low`.
- **`isOverdue(today = new Date())`:** true only if the task is not done and its due date is **before** today. A task due today is not overdue yet.
- **`getStatus()`:** returns `'overdue'` if `isOverdue()`, otherwise `super.getStatus()`. So a PriorityTask has three possible statuses.
- **`describe()`:** adds the priority and the due date, e.g. `(high, due 2026-10-14)`.

This is **polymorphism**: `user.getTasksByStatus('overdue')` calls `task.getStatus()` without knowing which class the task is. Each class answers in its own way.

A bad due date (e.g. `'not a date'`) becomes `null` instead of crashing (`toDate` in `models.js`).

### `markCompleted` now uses `toggle()`
```js
task.id === id && !task.isCompleted()
  ? new PriorityTask({ ...task }, task.priority).toggle()
  : task
```
It copies the task first and toggles the **copy**, so the original array is still not changed.

### User: `addTask()`, `getCompletionRate()`, `getTasksByStatus()`
- `addTask(task)` pushes the task into `user.tasks`.
- `getCompletionRate()` returns a percentage of done tasks, or 0 if the user has no tasks (this avoids dividing by zero).
- `getTasksByStatus(status)` returns the tasks whose `getStatus()` equals `'completed'`, `'pending'` or `'overdue'`.

`linkTasksToUsers(tasks, userMap)` in `taskProcessor.js` empties every user's list, then calls `addTask` for each task. It runs once after loading, and again after `complete`. That's needed because `markCompleted` makes a **new** task object, and the user must hold the new one. You can see the results in the `users` command: `12/20 done (60%), 5 overdue`.

### Where do categories and due dates come from?
**JSONPlaceholder has no categories, tags or due dates.** Like `pickPriority`, they are made up from the task id in `taskProcessor.js`:
- `pickCategory`: `'work'`, `'study'` or `'home'` (`id % 3`).
- `pickDueDate`: between 7 days ago and 6 days from today (`id % 14 - 7`). Because it is relative to today, the overdue count stays about the same each day.

Say this openly if you're asked: it is demo data, so that the Set, `isOverdue()` and `getStatus()` have something real to work with.

### Set of unique categories
```js
export const getUniqueCategories = (tasks) => new Set(tasks.map(({ category }) => category));
```
200 tasks, but only 3 different categories, so the Set keeps 3. The `summary` command prints them.

### Closure-based cache (`createCachedRequest` in `api.js`)
```js
export const createCachedRequest = (requestFn) => {
  const cache = new Map();
  return async (endpoint) => {
    if (cache.has(endpoint)) return cache.get(endpoint);
    const data = await requestFn(endpoint);
    cache.set(endpoint, data);
    return data;
  };
};
```
- The `cache` Map lives inside `createCachedRequest`. Only the returned function can reach it. That's the closure.
- The first request for an endpoint goes to the server. Later requests for the same endpoint get the saved answer.
- If the request fails, `await` throws **before** `cache.set`, so errors are never saved, and the next try goes to the server again.
- Each `APIClient` has its own cache (`this.cachedRequest` is created in the constructor).
- Honest limit: in this CLI, `/todos` and `/users` are loaded once per run, so you only see the cache working when the same request is made twice, e.g. calling `fetchUserTodos(1)` twice.

### `fetchUserTodos(userId)`: the Promise (`.then`) style
```js
fetchUserTodos(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return Promise.reject(new APIError(`"${userId}" is not a valid user id.`, 'input'));
  }
  return this.cachedRequest(`/users/${userId}/todos`).then((todos) =>
    Array.isArray(todos) ? todos : []
  );
}
```
- This is not an `async` function. It returns a Promise and uses `.then()`, so the project shows **both** styles. The other methods use `async/await`.
- `Promise.reject(...)` returns a promise that has already failed. The caller handles it the same way as any other error (`.catch` or `try/await`).
- With the same async/await code it would be: `const todos = await this.cachedRequest(...); return Array.isArray(todos) ? todos : [];`

### Timeout
```js
response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
```
- `AbortSignal.timeout(5000)` cancels the request after 5 seconds. `fetch` then rejects with an error named `'TimeoutError'`, which `request()` turns into an `APIError` of type `'timeout'`.
- It's built into Node 18+, so no package was needed.
- Checked against a real local server that never answers: it stopped after the timeout with type `timeout`.

### Malformed data and fallbacks
- `toTasks` / `toUsers`: if the API sends something that isn't an array, they treat it as an empty list. Records that aren't objects or don't have a whole-number `id` are skipped.
- `Task`: a non-text title becomes `'Untitled task'`, and `completed` is only true if it is really `true`.
- `User`: missing fields get `'Unknown user'`, `'unknown'`, `'no email'` and `'Unknown city'`.
- Empty API response: the app prints "The API returned no tasks." and all its counts are 0.

---

## 5. Tests

### Automated tests (`npm test`), 43 tests, all passing
They are in the `test/` folder and use Node's built-in test runner, so nothing needs installing. **None of them use the internet.** The task tests use a small made-up list of tasks. The API tests replace `fetch` with a fake one and put the real one back afterwards (`afterEach`).

- `test/taskProcessor.test.js` (18 tests):
  - priority rules
  - `markCompleted` sets `completed` and changes the priority to `low`, keeps the `PriorityTask` class, and doesn't change the original array
  - summary counts stay consistent after completing a task
  - `isValidId` / `parseIds` accept `1`, `5`, `200` and reject `abc`, `0`, `-1`, `1.5`, `0x4`, `1e0`, empty text, ` 3` and `+2`
  - all the filters
  - both sorts give the right order and leave the original array unchanged
  - empty lists
  - two counters stay independent (closure)
  - every task gets a category and a due date
  - `getUniqueCategories` returns a Set with no duplicates
  - `getOverdue` only returns unfinished, past-due tasks
  - malformed data is skipped
  - `markCompleted` keeps the category and due date
  - `linkTasksToUsers` fills each user's list, and doesn't double it when run again
- `test/models.test.js` (12 tests):
  - `Task` defaults, `toggle`, `isOverdue` and `getStatus`, and safe values for malformed data
  - `PriorityTask` inheritance, `getRank`, `describe` (with the due date), and invalid priority → medium
  - `PriorityTask` `toggle` (priority update), `isOverdue` and `getStatus` (overdue, due today, completed, no date), and a bad due date
  - `User` `addTask`, `getCompletionRate`, `getTasksByStatus`, and the city fallback
- `test/api.test.js` (13 tests):
  - OK response
  - network failure → `network`, 404 → `http`, bad JSON → `json`, slow server → `timeout`
  - the cache calls the server once per endpoint, doesn't save failures, and is used by `APIClient`
  - `fetchUserTodos` requests the right URL, rejects bad ids without calling the API, and returns `[]` for data that isn't a list
  - `getTasksAndUsers` returns both lists
  - `Promise.all` rejects when one request fails

### Things checked by running the app (not automated)
- Against the live API: every command (`all`, `completed`, `pending`, `priority`, `priority high`, `sort`, `search`, `user`, `users`, `complete`, `summary`, `help`), in a piped interactive session and as one-off commands.
- After `complete 1`: the task shows `(low)`, and the summary shows 91 completed and 91 low.
- `overdue`, plus the Overdue and Categories lines in `summary`, and the `(rate%)` / `overdue` columns in `users`. After `complete 3` (an overdue task), Overdue went from 57 to 56, and user 1 went from 11/20 (55%) with 6 overdue to 12/20 (60%) with 5 overdue.
- Live `fetchUserTodos(1)` returned 20 todos. Calling it again used the cache (1 network call in total).
- Timeout with the real `fetch` against a local server that never answers: an `APIError` of type `timeout`.
- Malformed API data (not a list, `null` items, bad ids, a number as the title): bad records were skipped and the app didn't crash.
- `EXIT`, `Exit`, `QUIT`, `Quit`, `quit` and `exit` all stop the CLI.
- Invalid ids (`complete abc 5`, `complete 0x4`, `complete 0`, `complete -3`, `complete 1.5`, `user 1e0`, `user abc 2`, `user 0`) all give a clear message and change nothing.
- With a fake `fetch`:
  - network failure, HTTP 500 and bad JSON each give their own message and hint, with exit code 1
  - an empty response shows a zero summary
- A deliberately broken command (simulated with a preloaded script):
  - in the interactive CLI it printed "That command failed: ..." and the CLI kept working
  - as a one-off command it printed "Unexpected error: ..." with exit code 1

Not tested: typing by hand in a real terminal, and pressing Ctrl+C. The piped input goes through the same readline loop, but try it yourself once before the review.

---

## 6. Live-coding practice

### A. "Show only high-priority tasks that are NOT done"
- **File:** `taskProcessor.js` (+ one case in `main.js`)
- **Approach:** combine two filters you already have.
```js
export const getUrgent = (tasks) => filterByPriority(getPending(tasks), 'high');
```
```js
case 'urgent':
  printTasks(getUrgent(tasks), userMap);
  break;
```
Add `getUrgent` to the import list in `main.js`.
- **Why it works:** each filter returns a new array, so you can chain them.
- **Test:** `node main.js urgent`. Every line should show `[ ]` and `(high)`.

### B. "Add the longest task title to the summary"
- **File:** `taskProcessor.js`, `main.js`
```js
export const longestTitle = (tasks) =>
  tasks.reduce((longest, { title }) => (title.length > longest.length ? title : longest), '');
```
In `printSummary`: `console.log(`Longest title:   ${longestTitle(tasks)}`);`
- **Why:** reduce carries the "best so far" through the array. The starting value `''` makes empty arrays safe.
- **Test:** `node main.js summary`

### C. "Sort titles Z-A instead of A-Z"
- **File:** `taskProcessor.js`, `sortByTitle`
```js
[...tasks].sort((a, b) => b.title.localeCompare(a.title));
```
- **Why:** swapping `a` and `b` flips the result of the compare.
- **Test:** `node main.js sort`. The first title should start with a late letter.

### D. "Make low priority come first"
- **File:** `taskProcessor.js`, `sortByPriority`
```js
[...tasks].sort((a, b) => a.getRank() - b.getRank() || a.id - b.id);
```
- **Test:** `node main.js priority`. The first lines should be `(low)`.

### E. "Add an 'urgent' priority level"
- **File:** `models.js`, and `summarize` in `taskProcessor.js`
```js
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
```
In `summarize`, add `urgent: 0` to `byPriority`. (Otherwise `totals.byPriority['urgent'] += 1` gives `NaN`.) If you want tasks to actually get it, change `pickPriority`, e.g. `if (id % 10 === 0) return 'urgent';` before the even/odd line.
- **Why:** `getRank()` uses the position in the array, so `urgent` automatically becomes rank 4, the highest.
- **Test:** `node main.js priority urgent`

### F. "Rewrite `fetchUserTodos` with async/await"
- **File:** `api.js`
```js
async fetchUserTodos(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new APIError(`"${userId}" is not a valid user id.`, 'input');
  }
  const todos = await this.cachedRequest(`/users/${userId}/todos`);
  return Array.isArray(todos) ? todos : [];
}
```
- **Why:** inside an `async` function, `throw` does the same job as `return Promise.reject(...)`, and `await` replaces `.then()`.
- **Test:** `npm test` (the `fetchUserTodos` tests should still pass), or `node -e "import('./api.js').then(async ({APIClient}) => console.log((await new APIClient().fetchUserTodos(1)).length))"` → 20

### G. "If loading users fails, still show the tasks"
- **File:** `api.js`, `getTasksAndUsers`
```js
async getTasksAndUsers() {
  const [taskResult, userResult] = await Promise.allSettled([this.getTasks(), this.getUsers()]);
  if (taskResult.status === 'rejected') throw taskResult.reason;
  const users = userResult.status === 'fulfilled' ? userResult.value : [];
  return { tasks: taskResult.value, users };
}
```
- **Why:** `allSettled` never rejects. It tells you which requests worked. `printTasks` already falls back to `User 3` when a name is missing.
- **Test:** temporarily change `getUsers` to request `/userz` → the tasks still load, and the owners show as "User N".

### H. "Count how many tasks each user has left"
Already almost there: `userReport` has `total` and `completed`. In `printUsers`, print `total - completed`.

---

## 7. Questions a reviewer might ask

- *Why is `request()` separate from `getTasks()`?* So the error handling is written once and every endpoint shares it.
- *What does `getTasksAndUsers` return if `/users` gives a 500?* It returns nothing. The promise rejects, and `main()` catches it and prints the message.
- *Is the "complete" command saved?* No. It only changes the in-memory array. JSONPlaceholder accepts writes but never stores them, so I didn't send a request and pretend it worked.
- *Why does `markCompleted` create a new PriorityTask instead of doing `task.completed = true`?* To avoid mutating the original data. Spreading a class instance gives a plain object, which loses methods like `describe()`, so I pass it back through the constructor. It also runs `pickPriority` again, so the completed task becomes `low`.
- *How does `complete` change the tasks that later commands see?* `state` is declared with `let` in `main()` and holds one object, `{ tasks, userMap }`. That same object is passed to `startCli` and then to `handleCommand` for every command. `handleCommand` does `state.tasks = markCompleted(tasks, id)`, which changes a *property* of that shared object. The next command reads `state.tasks` and gets the new list. (This would still work if `state` were `const`, because `const` only stops you giving the variable a new value. It doesn't stop you changing the object's properties.)
- *What happens if a command crashes?* The `try/catch` in `startCli` prints "That command failed: ..." and the CLI keeps going. `main().catch(...)` catches anything else, so there's never an unhandled promise rejection.
- *Where would you put a new filter?* In `taskProcessor.js`, then call it from a case in `handleCommand`.
- *Difference between `==` and `===`?* `===` doesn't convert types. I always use `===`.
- *What is `?.` / `??`?* Optional chaining and nullish coalescing: safe access to properties that might be missing, and a fallback value.
- *Why does `parseIds` reject the whole input instead of skipping bad ids?* If it skipped them, `complete abc 5` would quietly complete task 5, which the user may not have meant. It's safer to say "abc is not a valid id" and do nothing.
- *Why not `Number.isInteger(Number(text))`?* `Number('0x4')` is 4 and `Number('1e0')` is 1, so those would wrongly pass. The regex `/^\d+$/` only allows digits.

---

## 8. Known limits / open points

- Priorities, categories and due dates are made up (`pickPriority`, `pickCategory`, `pickDueDate`), not real API data.
- The `complete` command only lasts for the current session (on purpose, see above).
- `all` prints all 200 tasks. There's no paging.
- The timeout covers waiting for the server's answer. A very slow download of the body after that would be reported as a JSON error, not a timeout.
- `fetchUserTodos` and the cache are used and tested in code, but there's no CLI command that calls `fetchUserTodos`. In a normal run, each endpoint is requested once.
- `users` only lists users who have at least one task (`userReport` is built from the tasks). With this API, every user has tasks.
- The automated tests cover `taskProcessor.js`, `models.js` and `api.js`. `main.js` (the commands and printing) is checked by running the app, not by automated tests, because importing `main.js` starts the app.
- The requirements were checked against the list taken from the lab brief, not the full brief text, so check the brief for any exact method signatures or command names it requires.
