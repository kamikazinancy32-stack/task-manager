import { APIError } from '../../api.js';

// Small copies of real JSONPlaceholder records, so no test needs the internet
export const mockUsers = [
  {
    id: 1,
    name: 'Leanne Graham',
    username: 'Bret',
    email: 'Sincere@april.biz',
    address: { city: 'Gwenborough' },
  },
  {
    id: 2,
    name: 'Ervin Howell',
    username: 'Antonette',
    email: 'Shanna@melissa.tv',
    address: { city: 'Wisokyburgh' },
  },
  {
    id: 3,
    name: 'Clementine Bauch',
    username: 'Samantha',
    email: 'Nathan@yesenia.net',
    address: { city: 'McKenziehaven' },
  },
];

// Ids 1-3 have Lorem Ipsum titles (like the real API), the rest are already English
export const mockTodos = [
  { userId: 1, id: 1, title: 'delectus aut autem', completed: false },
  { userId: 1, id: 2, title: 'quis ut nam facilis et officia qui', completed: false },
  { userId: 1, id: 3, title: 'fugiat veniam minus', completed: true },
  { userId: 2, id: 4, title: 'Write the monthly report', completed: true },
  { userId: 2, id: 5, title: 'Review the budget', completed: false },
  { userId: 2, id: 6, title: 'Book the meeting room', completed: true },
  { userId: 3, id: 7, title: 'Fix the login bug', completed: false },
  { userId: 3, id: 8, title: 'Update the report template', completed: false },
];

// Every call gets its own copy, so one test can never change the data another test sees
const copy = (data) => structuredClone(data);

// A stand-in for APIClient: same method names, each one a jest.fn() that returns a Promise.
// Tests can still override one call, e.g. client.getUsers.mockRejectedValueOnce(error).
export const createMockApiClient = () => {
  const client = {
    request: jest.fn((endpoint) => {
      if (endpoint === '/todos') return Promise.resolve(copy(mockTodos));
      if (endpoint === '/users') return Promise.resolve(copy(mockUsers));
      return Promise.reject(
        new APIError(`The server answered ${endpoint} with error status 404.`, 'http')
      );
    }),
    getTasks: jest.fn(() => Promise.resolve(copy(mockTodos))),
    getUsers: jest.fn(() => Promise.resolve(copy(mockUsers))),
    fetchUserTodos: jest.fn((userId) => {
      if (!Number.isInteger(userId) || userId <= 0) {
        return Promise.reject(new APIError(`"${userId}" is not a valid user id.`, 'input'));
      }
      return Promise.resolve(copy(mockTodos.filter((todo) => todo.userId === userId)));
    }),
  };

  client.getTasksAndUsers = jest.fn(async () => {
    const [tasks, users] = await Promise.all([client.getTasks(), client.getUsers()]);
    return { tasks, users };
  });

  return client;
};
