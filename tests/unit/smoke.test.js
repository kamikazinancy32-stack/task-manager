import { Task } from '../../models.js';

// Checks that Jest runs and that Babel lets it load the project's ES modules
describe('Jest setup', () => {
  test('can import an ES module from the project', () => {
    expect(new Task({ id: 1 }).id).toBe(1);
  });
});
