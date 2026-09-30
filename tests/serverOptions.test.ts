import { describe, expect, it } from 'vitest';
import { serverOptions } from '../src/cli/serverOptions.js';

describe('serverOptions', () => {
  it('defaults to loopback on a free port', () => {
    expect(serverOptions({}, {})).toEqual({ port: 0, host: '127.0.0.1', allowedHosts: [] });
  });

  it('reads --port, --host and --allow-host', () => {
    expect(serverOptions({ port: '4747', host: '0.0.0.0', 'allow-host': 'a.test, b.test' }, {}))
      .toEqual({ port: 4747, host: '0.0.0.0', allowedHosts: ['a.test', 'b.test'] });
  });

  it('binds every interface for --lan', () => {
    expect(serverOptions({ lan: true }, {}).host).toBe('0.0.0.0');
  });

  it('falls back to MERMAID_DOCS_PORT, which --port overrides', () => {
    expect(serverOptions({}, { MERMAID_DOCS_PORT: '4100' }).port).toBe(4100);
    expect(serverOptions({ port: '4747' }, { MERMAID_DOCS_PORT: '4100' }).port).toBe(4747);
  });

  it('ignores a port that is not a number', () => {
    expect(serverOptions({ port: 'abc' }, {}).port).toBe(0);
    expect(serverOptions({}, { MERMAID_DOCS_PORT: '-1' }).port).toBe(0);
  });
});
