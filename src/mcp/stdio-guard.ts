import { Writable } from 'node:stream';

/**
 * Reserve stdout for MCP JSON-RPC.
 *
 * The same process also runs an HTTP server and a file watcher, and any dependency may
 * call console.log. A single stray write to stdout corrupts the JSON-RPC stream and the
 * client drops the connection, so stdout is captured for the transport and every other
 * writer is redirected to stderr.
 *
 * Must run before anything else is imported that might log.
 */
export function captureStdout(): Writable {
  const realWrite = process.stdout.write.bind(process.stdout);

  const transportStream = new Writable({
    write(chunk, encoding, callback) {
      realWrite(chunk, encoding as BufferEncoding, callback);
      return true;
    },
  });

  process.stdout.write = ((chunk: string | Uint8Array, encoding?: unknown, callback?: unknown) =>
    process.stderr.write(chunk as never, encoding as never, callback as never)) as typeof process.stdout.write;

  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);
  console.debug = (...args: unknown[]) => console.error(...args);

  return transportStream;
}
