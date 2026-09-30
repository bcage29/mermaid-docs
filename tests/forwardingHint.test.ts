import { describe, expect, it } from 'vitest';
import { forwardingHint } from '../src/mcp/forwardingHint.js';

describe('forwardingHint', () => {
  it('says nothing outside a container', () => {
    expect(forwardingHint(0, 51234, false)).toBeUndefined();
  });

  it('suggests pinning a port when it was picked at random', () => {
    const hint = forwardingHint(0, 51234, true)!;
    expect(hint).toContain('port 51234 was picked at random');
    expect(hint).toContain('"--port", "4747"');
    expect(hint).toContain('"forwardPorts": [4747]');
  });

  it('names the pinned port when it was bound', () => {
    const hint = forwardingHint(4100, 4100, true)!;
    expect(hint).toContain('add 4100 to "forwardPorts"');
    expect(hint).not.toContain('--port');
  });

  it('explains a fallback from a port that was taken', () => {
    const hint = forwardingHint(4100, 51234, true)!;
    expect(hint).toContain('port 4100 was in use, so it fell back to port 51234');
    expect(hint).toContain('forward port 51234 from the Ports panel');
  });
});
