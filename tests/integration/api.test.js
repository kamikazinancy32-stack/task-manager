import { APIClient, APIError } from '../../api.js';
import { mockTodos, mockUsers, createMockApiClient } from '../mocks/api.js';

const BASE_URL = 'https://jsonplaceholder.typicode.com';

// The parts of a fetch Response that APIClient uses
const okResponse = (data) => ({ ok: true, status: 200, json: jest.fn().mockResolvedValue(data) });
const errorResponse = (status) => ({ ok: false, status, json: jest.fn() });

const realFetch = global.fetch;
let client;

beforeEach(() => {
  global.fetch = jest.fn();
  client = new APIClient();
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('APIClient: successful requests', () => {
  test('getTasks calls the exact /todos URL once, with a timeout signal', async () => {
    fetch.mockResolvedValue(okResponse(mockTodos));

    await client.getTasks();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/todos`, { signal: expect.any(AbortSignal) });
  });

  test('getUsers calls the /users URL and resolves with the parsed users', async () => {
    fetch.mockResolvedValue(okResponse(mockUsers));

    await expect(client.getUsers()).resolves.toEqual(mockUsers);
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/users`, expect.any(Object));
  });

  test('fetchUserTodos(3) calls /users/3/todos and returns that user\'s todos', async () => {
    const userTodos = mockTodos.filter((todo) => todo.userId === 3);
    fetch.mockResolvedValue(okResponse(userTodos));

    await expect(client.fetchUserTodos(3)).resolves.toEqual(userTodos);
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/users/3/todos`, expect.any(Object));
  });

  test('uses a custom base URL when one is given', async () => {
    fetch.mockResolvedValue(okResponse([]));

    await new APIClient('http://localhost:3000').getUsers();

    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3000/users');
  });

  test('parses the response body with response.json() exactly once', async () => {
    const response = okResponse([{ id: 1 }]);
    fetch.mockResolvedValue(response);

    await expect(client.request('/todos')).resolves.toEqual([{ id: 1 }]);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  test('getTasksAndUsers requests both lists and returns them together', async () => {
    fetch.mockImplementation((url) =>
      Promise.resolve(okResponse(url.endsWith('/users') ? mockUsers : mockTodos))
    );

    await expect(client.getTasksAndUsers()).resolves.toEqual({ tasks: mockTodos, users: mockUsers });
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([`${BASE_URL}/todos`, `${BASE_URL}/users`]);
  });

  test('fetchUserTodos returns an empty list if the server sends something that is not a list', async () => {
    fetch.mockResolvedValue(okResponse({ message: 'oops' }));

    await expect(client.fetchUserTodos(1)).resolves.toEqual([]);
  });
});

describe('APIClient: caching', () => {
  test('a second call for the same endpoint uses the saved answer instead of fetching again', async () => {
    fetch.mockResolvedValue(okResponse(mockTodos));

    await client.getTasks();
    await client.getTasks();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a failed request is not saved, so the next call tries the server again', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(okResponse(mockUsers));

    await expect(client.getUsers()).rejects.toThrow(APIError);
    await expect(client.getUsers()).resolves.toEqual(mockUsers);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('APIClient: errors', () => {
  test('a network failure becomes an APIError of type "network" with the original error as cause', async () => {
    const networkError = new TypeError('fetch failed');
    fetch.mockRejectedValue(networkError);

    const promise = client.getTasks();

    await expect(promise).rejects.toThrow('Could not reach the server for /todos.');
    await expect(promise).rejects.toMatchObject({ name: 'APIError', type: 'network', cause: networkError });
  });

  test('a 404 response becomes an APIError of type "http" and the body is not parsed', async () => {
    const response = errorResponse(404);
    fetch.mockResolvedValue(response);

    const promise = client.fetchUserTodos(99);

    await expect(promise).rejects.toThrow('The server answered /users/99/todos with error status 404.');
    await expect(promise).rejects.toHaveProperty('type', 'http');
    expect(response.json).not.toHaveBeenCalled();
  });

  test('a 500 response becomes an APIError of type "http"', async () => {
    fetch.mockResolvedValue(errorResponse(500));

    await expect(client.getUsers()).rejects.toThrow('The server answered /users with error status 500.');
  });

  test('getTasksAndUsers fails if one of the two requests fails', async () => {
    fetch.mockImplementation((url) =>
      Promise.resolve(url.endsWith('/users') ? errorResponse(500) : okResponse(mockTodos))
    );

    await expect(client.getTasksAndUsers()).rejects.toThrow('The server answered /users with error status 500.');
  });

  test('a body that is not valid JSON becomes an APIError of type "json"', async () => {
    const response = okResponse(null);
    response.json.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    fetch.mockResolvedValue(response);

    const promise = client.getTasks();

    await expect(promise).rejects.toThrow('The server sent data for /todos that is not valid JSON.');
    await expect(promise).rejects.toHaveProperty('type', 'json');
  });

  test('a server that does not answer in time becomes an APIError of type "timeout"', async () => {
    // This fetch never answers by itself; it only stops when the timeout signal fires
    fetch.mockImplementation(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        })
    );

    const promise = new APIClient(undefined, 20).getTasks();

    await expect(promise).rejects.toThrow('The server did not answer /todos within 0.02 seconds.');
    await expect(promise).rejects.toHaveProperty('type', 'timeout');
  });

  test('fetchUserTodos rejects invalid user ids without calling the server', async () => {
    await expect(client.fetchUserTodos(0)).rejects.toThrow('"0" is not a valid user id.');
    await expect(client.fetchUserTodos(-1)).rejects.toThrow('"-1" is not a valid user id.');
    await expect(client.fetchUserTodos('abc')).rejects.toThrow('"abc" is not a valid user id.');
    await expect(client.fetchUserTodos(1.5)).rejects.toHaveProperty('type', 'input');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('mock API client (tests/mocks/api.js)', () => {
  test('has every method the real APIClient has', () => {
    const realMethods = Object.getOwnPropertyNames(APIClient.prototype).filter((name) => name !== 'constructor');
    const mock = createMockApiClient();

    realMethods.forEach((name) => expect(typeof mock[name]).toBe('function'));
  });

  test('its methods return Promises that resolve with the mock data', async () => {
    const mock = createMockApiClient();

    await expect(mock.getTasks()).resolves.toEqual(mockTodos);
    await expect(mock.getUsers()).resolves.toEqual(mockUsers);
    await expect(mock.request('/users')).resolves.toEqual(mockUsers);
    await expect(mock.fetchUserTodos(2)).resolves.toHaveLength(3);
    await expect(mock.getTasksAndUsers()).resolves.toEqual({ tasks: mockTodos, users: mockUsers });
    await expect(mock.request('/nope')).rejects.toThrow('The server answered /nope with error status 404.');
    await expect(mock.fetchUserTodos(0)).rejects.toThrow('"0" is not a valid user id.');
  });
});
