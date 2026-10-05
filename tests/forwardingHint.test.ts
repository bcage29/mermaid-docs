import { describe, expect, it } from 'vitest';
import { forwardingHint } from '../src/mcp/forwardingHint.js';

describe('forwardingHint', () => {
  it('says nothing outside a container', () => {
    expect(forwardingHint(0, 51234, false)).toBeUndefined();
  });

  it('explains container forwarding and port selection on separate lines', () => {
    const hint = forwardingHint(0, 51234, true)!;
    expect(hint).toContain('Detected a container environment; port 51234 may not be automatically forwarded.');
    expect(hint).toContain('Forward it if needed.\nPass --port <port> to request a fixed port on each start.');
    expect(hint.split('\n')).toHaveLength(2);
  });

  it('names the pinned port when it was bound', () => {
    const hint = forwardingHint(4100, 4100, true)!;
    expect(hint).toContain('Detected a container environment; viewer is on port 4100');
    expect(hint).toContain('forward it manually');
    expect(hint).not.toContain('--port');
  });

  it('explains a fallback from a port that was taken', () => {
    const hint = forwardingHint(4100, 51234, true)!;
    expect(hint).toContain('Detected a container environment; port 4100 is busy, so using 51234.');
    expect(hint).toContain('Pass --port <free-port>');
  });
});
