const BASE_URL = 'https://jsonplaceholder.typicode.com';
const TIMEOUT_MS = 5000;

// An Error that also says what kind of problem happened:
// 'network', 'timeout', 'http', 'json' or 'input'
export class APIError extends Error {
  constructor(message, type, cause) {
    super(message, { cause });
    this.name = 'APIError';
    this.type = type;
  }
}

// Closure: "cache" lives inside this function. Only the function it returns can read or change it.
// The first request for an endpoint goes to the server; after that the saved answer is reused.
export const createCachedRequest = (requestFn) => {
  const cache = new Map();

  return async (endpoint) => {
    if (cache.has(endpoint)) return cache.get(endpoint);
    const data = await requestFn(endpoint);
    cache.set(endpoint, data); // only reached if the request worked, so errors are never cached
    return data;
  };
};

export class APIClient {
  constructor(baseUrl = BASE_URL, timeoutMs = TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.cachedRequest = createCachedRequest((endpoint) => this.request(endpoint));
  }

  async request(endpoint) {
    let response;

    try {
      // AbortSignal.timeout cancels the request if the server takes too long
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new APIError(`The server did not answer ${endpoint} within ${this.timeoutMs / 1000} seconds.`, 'timeout', error);
      }
      throw new APIError(`Could not reach the server for ${endpoint}.`, 'network', error);
    }

    if (!response.ok) {
      throw new APIError(`The server answered ${endpoint} with error status ${response.status}.`, 'http');
    }

    // "return await" (not just "return") so a JSON error is caught by this try/catch
    try {
      return await response.json();
    } catch (error) {
      throw new APIError(`The server sent data for ${endpoint} that is not valid JSON.`, 'json', error);
    }
  }

  getTasks() {
    return this.cachedRequest('/todos');
  }

  getUsers() {
    return this.cachedRequest('/users');
  }

  // Written with .then() instead of async/await, to show the Promise-based style
  fetchUserTodos(userId) {
    if (!Number.isInteger(userId) || userId <= 0) {
      return Promise.reject(new APIError(`"${userId}" is not a valid user id.`, 'input'));
    }
    return this.cachedRequest(`/users/${userId}/todos`).then((todos) =>
      Array.isArray(todos) ? todos : []
    );
  }

  async getTasksAndUsers() {
    const [tasks, users] = await Promise.all([this.getTasks(), this.getUsers()]);
    return { tasks, users };
  }
}
