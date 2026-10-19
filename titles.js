// JSONPlaceholder task titles are Lorem Ipsum (fake Latin), e.g. "delectus aut autem".
// The website swaps those for clear English titles. The new title is chosen from the
// task id, so the same task always gets the same title (it never changes on refresh).
// Titles that are already English are left exactly as they are.

// Every word used in JSONPlaceholder's titles, except words that are also normal English
// (a, ad, at, cum, dicta, error, ex, hic, id, in, minima, minus, non, quasi, rem)
const LATIN_WORDS = new Set(`
  ab accusamus accusantium adipisci alias aliquam aliquid amet animi aperiam architecto
  asperiores aspernatur assumenda atque aut autem beatae blanditiis commodi consectetur
  consequatur consequuntur corporis corrupti culpa cumque cupiditate debitis delectus deleniti
  deserunt dignissimos distinctio dolor dolore dolorem doloremque dolores doloribus dolorum
  ducimus ea eaque earum eius eligendi enim eos esse est et eum eveniet excepturi
  exercitationem expedita explicabo facere facilis fuga fugiat fugit harum illo illum impedit
  incidunt inventore ipsa ipsam ipsum iste itaque iure iusto labore laboriosam laborum
  laudantium libero magnam magni maiores maxime modi molestiae molestias mollitia nam natus
  necessitatibus nemo neque nesciunt nihil nisi nobis nulla numquam occaecati odio odit officia
  officiis omnis optio pariatur perferendis perspiciatis placeat porro possimus praesentium
  provident quae quaerat quam quas qui quia quibusdam quidem quis quisquam quo quod quos
  ratione recusandae reiciendis repellat repellendus reprehenderit repudiandae rerum saepe
  sapiente sed sequi similique sint sit soluta sunt suscipit tempora tempore temporibus tenetur
  totam ullam unde ut vel velit veniam veritatis vero vitae voluptas voluptate voluptatem
  voluptates voluptatibus voluptatum
`.trim().split(/\s+/));

// 20 actions x 10 projects = 200 different titles, one for each JSONPlaceholder task
export const ACTIONS = [
  'Write unit tests',
  'Review the pull request',
  'Update the user guide',
  'Fix the login bug',
  'Plan the next sprint',
  'Prepare the client demo',
  'Test the search feature',
  'Design the dashboard layout',
  'Set up automatic backups',
  'Run an accessibility check',
  'Write the release notes',
  'Improve page load speed',
  'Collect user feedback',
  'Update the project timeline',
  'Prepare the weekly status report',
  'Organise a code review session',
  'Fix broken links',
  'Add input validation',
  'Create an onboarding guide',
  'Clean up old test data',
];

export const PROJECTS = [
  'mobile app',
  'company website',
  'HR portal',
  'training platform',
  'payments service',
  'customer support tool',
  'inventory system',
  'booking system',
  'reporting dashboard',
  'team chat app',
];

// A title counts as placeholder text if at least half of its words are Lorem Ipsum words
export const isPlaceholderTitle = (title) => {
  if (typeof title !== 'string') return false;
  const words = title.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const latinCount = words.filter((word) => LATIN_WORDS.has(word)).length;
  return latinCount / words.length >= 0.5;
};

// Task 1 -> action 1 + project 1, task 2 -> action 2 + project 1, ... task 21 -> action 1 + project 2
export const englishTitleFor = (id) => {
  const total = ACTIONS.length * PROJECTS.length;
  const index = (((id - 1) % total) + total) % total; // always 0-199, even for unusual ids
  const action = ACTIONS[index % ACTIONS.length];
  const project = PROJECTS[Math.floor(index / ACTIONS.length)];
  return `${action} for the ${project}`;
};

// Works on the raw API records, before toTasks(), so search and sort use the English titles.
// Only the title changes: id, completed and userId stay the same. Malformed records are
// passed through untouched, so toTasks() can skip them as before.
export const withReadableTitles = (rawTasks) => {
  if (!Array.isArray(rawTasks)) return rawTasks;
  return rawTasks.map((raw) =>
    raw && Number.isInteger(raw.id) && isPlaceholderTitle(raw.title)
      ? { ...raw, title: englishTitleFor(raw.id) }
      : raw
  );
};
