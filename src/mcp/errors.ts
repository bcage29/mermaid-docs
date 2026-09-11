import { inspect } from 'node:util';
import { UserInputError } from '../core/errors.js';

const FILE_ERRORS: Record<string, string> = {
  ENOENT: 'The requested file or directory was not found.',
  EACCES: 'Permission denied while accessing the requested file or directory.',
  EPERM: 'Permission denied while accessing the requested file or directory.',
  EEXIST: 'The requested file or directory already exists.',
  EISDIR: 'Expected a file, but found a directory.',
  ENOTDIR: 'Expected a directory, but found a file.',
  ENOSPC: 'There is not enough disk space to complete the operation.',
  ELOOP: 'The requested path contains too many symbolic links.',
};

export function mcpErrorMessage(error: unknown): string {
  if (error instanceof UserInputError) return error.message;
  if (error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const message = Object.hasOwn(FILE_ERRORS, error.code) ? FILE_ERRORS[error.code] : undefined;
    if (message) return message;
  }
  process.stderr.write(`mermaid-docs MCP tool failed: ${inspect(error)}\n`);
  return 'Unable to complete the operation. Check the input and try again.';
}