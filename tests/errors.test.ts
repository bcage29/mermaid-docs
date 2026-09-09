import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserInputError } from '../src/core/errors.js';
import { mcpErrorMessage } from '../src/mcp/errors.js';

afterEach(() => vi.restoreAllMocks());

describe('MCP error messages', () => {
  it('preserves explicitly safe validation feedback', () => {
    expect(mcpErrorMessage(new UserInputError('A step id is required.'))).toBe('A step id is required.');
  });

  it.each(['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'EISDIR', 'ENOTDIR', 'ENOSPC', 'ELOOP'])
    ('reports %s without raw paths or exception details', (code) => {
      const error = Object.assign(new Error('SYNTHETIC_PRIVATE_DETAIL /private/workspace/file.mmd'), { code });
      const message = mcpErrorMessage(error);
      expect(message).not.toContain('SYNTHETIC_PRIVATE_DETAIL');
      expect(message).not.toContain('/private');
      expect(message).not.toContain('Unable to complete');
    });

  it.each([new Error('SYNTHETIC_PRIVATE_DETAIL'), 'SYNTHETIC_PRIVATE_DETAIL', null, { code: 'constructor' }])
    ('reports unexpected failures only on stderr', (error) => {
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdout = vi.spyOn(process.stdout, 'write');
      expect(mcpErrorMessage(error)).toBe('Unable to complete the operation. Check the input and try again.');
      expect(stderr).toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      if (error instanceof Error || typeof error === 'string') {
        expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('SYNTHETIC_PRIVATE_DETAIL');
      }
    });
});