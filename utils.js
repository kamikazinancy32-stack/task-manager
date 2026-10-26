// Generic array helpers. They work on any list of objects and never change the list they are given.
// Wrong arguments are a programming mistake, so they throw a TypeError with a clear message.

const ORDERS = ['asc', 'desc'];

const checkList = (list, name) => {
  if (!Array.isArray(list)) throw new TypeError(`${name}() needs an array.`);
};

const checkFunction = (fn, name) => {
  if (typeof fn !== 'function') throw new TypeError(`${name}() needs a function.`);
};

export const filterBy = (list, test) => {
  checkList(list, 'filterBy');
  checkFunction(test, 'filterBy');
  return list.filter(test);
};

export const mapTo = (list, transform) => {
  checkList(list, 'mapTo');
  checkFunction(transform, 'mapTo');
  return list.map(transform);
};

// Always starts from initialValue, so an empty list gives back initialValue instead of an error
export const reduceTo = (list, reducer, initialValue) => {
  checkList(list, 'reduceTo');
  checkFunction(reducer, 'reduceTo');
  return list.reduce(reducer, initialValue);
};

// Case-insensitive "contains" search on one text property, e.g. searchByProperty(tasks, 'title', 'report')
export const searchByProperty = (list, key, text) => {
  checkList(list, 'searchByProperty');
  if (typeof text !== 'string') throw new TypeError('searchByProperty() needs text to search for.');
  const needle = text.toLowerCase();
  return list.filter((item) => {
    const value = item?.[key];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
};

// key is a property name ('title') or a function that gives the value to sort by (task => task.getRank()).
// Text is compared with localeCompare, everything else with < and >.
// Works on a copy, and Array.sort keeps equal items in their original order (it is stable).
export const sortBy = (list, key, order = 'asc') => {
  checkList(list, 'sortBy');
  if (!ORDERS.includes(order)) throw new TypeError(`sortBy() order must be 'asc' or 'desc'.`);
  const valueOf = typeof key === 'function' ? key : (item) => item?.[key];
  const direction = order === 'asc' ? 1 : -1;

  return [...list].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    const result =
      typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x > y) - (x < y);
    return result * direction;
  });
};
