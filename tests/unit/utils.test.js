import * as utils from '../../utils.js';
import { Task, PriorityTask } from '../../models.js';
import { sortByPriority, searchByTitle, countCompleted } from '../../taskProcessor.js';

const { filterBy, mapTo, reduceTo, searchByProperty, sortBy } = utils;

let people;

beforeEach(() => {
  people = [
    { id: 3, name: 'carla', age: 41 },
    { id: 1, name: 'Ana', age: 29 },
    { id: 2, name: 'ben', age: 35 },
  ];
});

describe('filterBy', () => {
  test('keeps the items that pass the test function', () => {
    expect(filterBy(people, (p) => p.age > 30).map((p) => p.id)).toEqual([3, 2]);
  });

  test('returns an empty list for an empty list', () => {
    expect(filterBy([], () => true)).toEqual([]);
  });

  test('returns a new list and does not change the original', () => {
    const result = filterBy(people, () => true);
    expect(result).not.toBe(people);
    expect(result).toEqual(people);
  });

  test('throws a clear error when the list is not an array', () => {
    expect(() => filterBy(null, () => true)).toThrow('filterBy() needs an array.');
    expect(() => filterBy('abc', () => true)).toThrow(TypeError);
  });

  test('throws a clear error when the test is not a function', () => {
    expect(() => filterBy(people, 'age')).toThrow('filterBy() needs a function.');
  });
});

describe('mapTo', () => {
  test('turns every item into a new value', () => {
    expect(mapTo(people, (p) => p.name)).toEqual(['carla', 'Ana', 'ben']);
  });

  test('returns an empty list for an empty list', () => {
    expect(mapTo([], (p) => p.name)).toEqual([]);
  });

  test('throws a clear error for a missing list or function', () => {
    expect(() => mapTo(undefined, (p) => p)).toThrow('mapTo() needs an array.');
    expect(() => mapTo(people)).toThrow('mapTo() needs a function.');
  });
});

describe('reduceTo', () => {
  test('combines the items into one value', () => {
    expect(reduceTo(people, (sum, p) => sum + p.age, 0)).toBe(105);
  });

  test('returns the starting value for an empty list instead of throwing', () => {
    expect(reduceTo([], (sum, p) => sum + p.age, 0)).toBe(0);
  });

  test('throws a clear error for a missing list or function', () => {
    expect(() => reduceTo({}, (a) => a, 0)).toThrow('reduceTo() needs an array.');
    expect(() => reduceTo(people, null, 0)).toThrow('reduceTo() needs a function.');
  });
});

describe('searchByProperty', () => {
  test('finds part of a text property, ignoring upper/lower case', () => {
    expect(searchByProperty(people, 'name', 'AN').map((p) => p.id)).toEqual([1]);
    expect(searchByProperty(people, 'name', 'a').map((p) => p.id)).toEqual([3, 1]);
  });

  test('skips items whose property is missing or not text, and null items', () => {
    const mixed = [{ name: 'Ana' }, { name: 42 }, {}, null];
    expect(searchByProperty(mixed, 'name', 'a')).toEqual([{ name: 'Ana' }]);
  });

  test('returns an empty list when nothing matches or the list is empty', () => {
    expect(searchByProperty(people, 'name', 'zoe')).toEqual([]);
    expect(searchByProperty([], 'name', 'a')).toEqual([]);
  });

  test('throws a clear error when the list is not an array', () => {
    expect(() => searchByProperty(null, 'name', 'a')).toThrow('searchByProperty() needs an array.');
  });

  test('throws a clear error when the search text is not text', () => {
    expect(() => searchByProperty(people, 'name', null)).toThrow('searchByProperty() needs text to search for.');
  });
});

describe('sortBy', () => {
  test('sorts text A-Z by default, ignoring upper/lower case', () => {
    expect(sortBy(people, 'name').map((p) => p.name)).toEqual(['Ana', 'ben', 'carla']);
  });

  test("sorts numbers from biggest to smallest with 'desc'", () => {
    expect(sortBy(people, 'age', 'desc').map((p) => p.age)).toEqual([41, 35, 29]);
  });

  test('accepts a function as the key', () => {
    expect(sortBy(people, (p) => p.name.length).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  test('keeps equal items in their original order (stable)', () => {
    const list = [{ id: 1, group: 'b' }, { id: 2, group: 'a' }, { id: 3, group: 'b' }, { id: 4, group: 'a' }];
    expect(sortBy(list, 'group').map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });

  test('returns a new list and does not change the original', () => {
    const sorted = sortBy(people, 'id');
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(people.map((p) => p.id)).toEqual([3, 1, 2]);
  });

  test('handles an empty list and items with the property missing', () => {
    expect(sortBy([], 'id')).toEqual([]);
    expect(sortBy([{ id: 2 }, {}, { id: 1 }], 'id')).toHaveLength(3);
  });

  test("throws a clear error for an order that is not 'asc' or 'desc'", () => {
    expect(() => sortBy(people, 'id', 'up')).toThrow("sortBy() order must be 'asc' or 'desc'.");
  });

  test('throws a clear error when the list is not an array', () => {
    expect(() => sortBy(undefined, 'id')).toThrow('sortBy() needs an array.');
  });
});

describe('spies', () => {
  let logSpy;
  let errorSpy;
  let warnSpy;
  let spies;

  beforeEach(() => {
    // Mock the console so nothing is printed while the tests run
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    spies = [];
  });

  afterEach(() => {
    [logSpy, errorSpy, warnSpy, ...spies].forEach((spy) => spy.mockRestore());
  });

  test('filterBy calls the array filter method once, with the test function', () => {
    const filterSpy = jest.spyOn(people, 'filter');
    spies.push(filterSpy);
    const isAdult = (p) => p.age >= 18;

    filterBy(people, isAdult);

    expect(filterSpy).toHaveBeenCalledTimes(1);
    expect(filterSpy).toHaveBeenCalledWith(isAdult);
  });

  test('reduceTo passes the reducer and the starting value to the array reduce method', () => {
    const reduceSpy = jest.spyOn(people, 'reduce');
    spies.push(reduceSpy);
    const add = (sum, p) => sum + p.age;

    reduceTo(people, add, 100);

    expect(reduceSpy).toHaveBeenCalledWith(add, 100);
  });

  test('sortBy never calls sort on the original list, so it cannot change it', () => {
    const sortSpy = jest.spyOn(people, 'sort');
    spies.push(sortSpy);

    sortBy(people, 'name');

    expect(sortSpy).not.toHaveBeenCalled();
  });

  test('sortByPriority calls sortBy twice: by id first, then by rank from high to low', () => {
    const sortBySpy = jest.spyOn(utils, 'sortBy');
    spies.push(sortBySpy);
    const tasks = [new PriorityTask({ id: 2 }, 'low'), new PriorityTask({ id: 1 }, 'high')];

    sortByPriority(tasks);

    expect(sortBySpy).toHaveBeenCalledTimes(2);
    expect(sortBySpy).toHaveBeenNthCalledWith(1, tasks, 'id');
    expect(sortBySpy).toHaveBeenNthCalledWith(2, expect.any(Array), expect.any(Function), 'desc');
  });

  test('searchByTitle passes the list, the "title" key and the word to searchByProperty', () => {
    const searchSpy = jest.spyOn(utils, 'searchByProperty');
    spies.push(searchSpy);
    const tasks = [new Task({ id: 1, title: 'Write report' })];

    const result = searchByTitle(tasks, 'report');

    expect(searchSpy).toHaveBeenCalledWith(tasks, 'title', 'report');
    expect(searchSpy).toHaveReturnedWith(result);
  });

  test('countCompleted asks each task isCompleted() exactly once', () => {
    const isCompletedSpy = jest.spyOn(Task.prototype, 'isCompleted');
    spies.push(isCompletedSpy);
    const tasks = [new Task({ id: 1, completed: true }), new Task({ id: 2 }), new PriorityTask({ id: 3 })];

    expect(countCompleted(tasks)).toBe(1);
    expect(isCompletedSpy).toHaveBeenCalledTimes(3);
  });

  test('sortByPriority reads the rank with getRank() and does not change any task', () => {
    const rankSpy = jest.spyOn(PriorityTask.prototype, 'getRank');
    spies.push(rankSpy);
    const tasks = [new PriorityTask({ id: 1 }, 'low'), new PriorityTask({ id: 2 }, 'high')];

    expect(sortByPriority(tasks).map((t) => t.id)).toEqual([2, 1]);
    expect(rankSpy).toHaveBeenCalled();
    expect(rankSpy.mock.results.every(({ value }) => [1, 2, 3].includes(value))).toBe(true);
    expect(tasks.map((t) => t.priority)).toEqual(['low', 'high']);
  });

  test('the helpers never print to the console, even when they throw', () => {
    filterBy(people, () => true);
    expect(() => sortBy(people, 'id', 'sideways')).toThrow();
    expect(() => mapTo(null, (x) => x)).toThrow();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
