import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { APIClient, APIError, createCachedRequest } from '../api.js';

// Replace the real fetch with a fake one, so these tests never use the internet
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const fakeResponse = (body, status = 200) => async () => new Response(body, { status });

test('request returns the parsed JSON when the server answers OK', async () => {
  globalThis.fetch = fakeResponse('[{"id":1}]');
  assert.deepEqual(await new APIClient().request('/todos'), [{ id: 1 }]);
});

test('a network failure becomes an APIError of type "network"', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(new APIClient().request('/todos'), (error) => {
    assert.ok(error instanceof APIError);
    assert.equal(error.type, 'network');
    return true;
  });
});

test('an HTTP error status becomes an APIError of type "http"', async () => {
  globalThis.fetch = fakeResponse('Not found', 404);
  await assert.rejects(new APIClient().request('/nope'), (error) => {
    assert.equal(error.type, 'http');
    assert.match(error.message, /404/);
    return true;
  });
});

test('invalid JSON becomes an APIError of type "json"', async () => {
  globalThis.fetch = fakeResponse('<html>oops</html>');
  await assert.rejects(new APIClient().request('/todos'), (error) => {
    assert.equal(error.type, 'json');
    return true;
  });
});

test('getTasksAndUsers returns both lists', async () => {
  globalThis.fetch = async (url) =>
    new Response(url.endsWith('/users') ? '[{"id":1}]' : '[{"id":10},{"id":11}]');
  const { tasks, users } = await new APIClient().getTasksAndUsers();
  assert.equal(tasks.length, 2);
  assert.equal(users.length, 1);
});

test('a request that takes too long becomes an APIError of type "timeout"', async () => {
  // This fake fetch never answers; it only stops when the timeout signal fires
  globalThis.fetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  await assert.rejects(new APIClient(undefined, 50).request('/todos'), (error) => {
    assert.equal(error.type, 'timeout');
    return true;
  });
});

test('createCachedRequest only calls the real request once per endpoint (closure cache)', async () => {
  let calls = 0;
  const cached = createCachedRequest(async (endpoint) => {
    calls += 1;
    return `data for ${endpoint}`;
  });

  assert.equal(await cached('/todos'), 'data for /todos');
  assert.equal(await cached('/todos'), 'data for /todos');
  assert.equal(calls, 1);
  await cached('/users');
  assert.equal(calls, 2);
});

test('createCachedRequest does not save failed requests', async () => {
  let calls = 0;
  const cached = createCachedRequest(async () => {
    calls += 1;
    if (calls === 1) throw new Error('first try fails');
    return 'ok';
  });

  await assert.rejects(cached('/todos'), /first try fails/);
  assert.equal(await cached('/todos'), 'ok');
});

test('APIClient reuses cached answers instead of fetching again', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('[]');
  };
  const client = new APIClient();
  await client.getTasks();
  await client.getTasks();
  assert.equal(calls, 1);
});

test('fetchUserTodos(userId) loads one user\'s todos (Promise .then style)', async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return new Response('[{"id":1,"userId":3}]');
  };
  const todos = await new APIClient().fetchUserTodos(3);
  assert.match(requestedUrl, /\/users\/3\/todos$/);
  assert.deepEqual(todos, [{ id: 1, userId: 3 }]);
});

test('fetchUserTodos rejects an invalid user id without calling the API', async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('[]');
  };
  await assert.rejects(new APIClient().fetchUserTodos(0), (error) => error.type === 'input');
  await assert.rejects(new APIClient().fetchUserTodos('abc'), (error) => error.type === 'input');
  assert.equal(called, false);
});

test('fetchUserTodos returns an empty list if the API sends something that is not a list', async () => {
  globalThis.fetch = async () => new Response('{"oops":true}');
  assert.deepEqual(await new APIClient().fetchUserTodos(1), []);
});

test('getTasksAndUsers rejects if one of the two requests fails (Promise.all)', async () => {
  globalThis.fetch = async (url) =>
    url.endsWith('/users') ? new Response('error', { status: 500 }) : new Response('[]');
  await assert.rejects(new APIClient().getTasksAndUsers(), /500/);
});
