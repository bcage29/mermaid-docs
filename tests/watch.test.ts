import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { watchWorkspace } from '../src/server/watch.js';

class FakeWatcher extends EventEmitter {
  async close() {}
}

const fake = new FakeWatcher();

vi.mock('chokidar', () => ({ watch: () => fake }));

afterEach(() => {
  vi.restoreAllMocks();
  fake.removeAllListeners();
});

describe('workspace watcher', () => {
  it('survives a file it cannot watch', () => {
    // chokidar reports an unwatchable entry as an error event, and an EventEmitter with
    // no error listener rethrows: one stale socket in the workspace killed the server.
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    watchWorkspace('/workspace', () => {});

    expect(() => fake.emit('error', new Error("watch '/tmp/socket'"))).not.toThrow();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("watch '/tmp/socket'"));
  });
});
