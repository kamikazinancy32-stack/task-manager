import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS,
  PROJECTS,
  englishTitleFor,
  isPlaceholderTitle,
  withReadableTitles,
} from '../titles.js';

// Real titles copied from JSONPlaceholder, so this test needs no internet
const LOREM_TITLES = [
  'delectus aut autem',
  'quis ut nam facilis et officia qui',
  'fugiat veniam minus',
  'et porro tempora',
  'laboriosam mollitia et enim quasi adipisci quia provident illum',
  'qui ullam ratione quibusdam voluptatem quia omnis',
  'illo expedita consequatur quia in',
  'a eos eaque nihil et exercitationem incidunt delectus',
  'ab voluptatum amet voluptas',
  'ipsa repellendus fugit nisi',
];

const ENGLISH_TITLES = [
  'Write Alpha report',
  'Review Beta plan',
  'Buy milk',
  'Fix the error in a form',
  'Plan a team lunch in Accra',
  'Review et al. citations',
  'Email the non-profit partner',
];

test('isPlaceholderTitle spots Lorem Ipsum titles', () => {
  LOREM_TITLES.forEach((title) => assert.equal(isPlaceholderTitle(title), true, title));
});

test('isPlaceholderTitle leaves English titles alone, even with words like "a", "in" or "et"', () => {
  ENGLISH_TITLES.forEach((title) => assert.equal(isPlaceholderTitle(title), false, title));
});

test('isPlaceholderTitle is safe with empty or non-text titles', () => {
  [undefined, null, 42, '', '   ', '123'].forEach((title) =>
    assert.equal(isPlaceholderTitle(title), false, String(title))
  );
});

test('englishTitleFor always gives the same title for the same id', () => {
  assert.equal(englishTitleFor(1), 'Write unit tests for the mobile app');
  assert.equal(englishTitleFor(2), 'Review the pull request for the mobile app');
  assert.equal(englishTitleFor(21), 'Write unit tests for the company website');
  assert.equal(englishTitleFor(200), 'Clean up old test data for the team chat app');
  assert.equal(englishTitleFor(57), englishTitleFor(57));
});

test('englishTitleFor gives 200 different titles for ids 1-200', () => {
  const titles = Array.from({ length: 200 }, (_, i) => englishTitleFor(i + 1));
  assert.equal(new Set(titles).size, ACTIONS.length * PROJECTS.length);
  assert.equal(new Set(titles).size, 200);
});

test('englishTitleFor never fails for unusual ids', () => {
  [0, -5, 201, 99999].forEach((id) => assert.equal(typeof englishTitleFor(id), 'string'));
  assert.equal(englishTitleFor(201), englishTitleFor(1)); // wraps around after 200
});

test('withReadableTitles replaces only placeholder titles and keeps everything else', () => {
  const raw = [
    { id: 1, title: 'delectus aut autem', completed: false, userId: 1 },
    { id: 2, title: 'Write Alpha report', completed: true, userId: 2 },
  ];
  const result = withReadableTitles(raw);

  assert.deepEqual(result[0], {
    id: 1,
    title: 'Write unit tests for the mobile app',
    completed: false,
    userId: 1,
  });
  assert.equal(result[1], raw[1]); // English title: the very same object, untouched
  assert.equal(raw[0].title, 'delectus aut autem'); // the original data is not changed
});

test('withReadableTitles passes malformed data through unchanged', () => {
  assert.equal(withReadableTitles(null), null);
  assert.deepEqual(withReadableTitles({ not: 'a list' }), { not: 'a list' });
  const raw = [null, 'text', { title: 'delectus aut autem' }, { id: 'x', title: 'et porro tempora' }];
  assert.deepEqual(withReadableTitles(raw), raw);
});
