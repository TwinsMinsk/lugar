import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  flushErrorReporting,
  initErrorReporting,
  reportError,
  resetErrorReportingForTests,
} from '@/lib/report-error';

/**
 * Proves the transport actually transports.
 *
 * Error reporting is the one piece of infrastructure whose failure mode is
 * silence: wired up wrong, it looks exactly like a week with no crashes. Since
 * a DSN is only an HTTP endpoint, this stands one up and reads what arrives —
 * no account, no network, and no waiting for a real incident to find out.
 */
const envelopes: string[] = [];
let server: Server;
let dsn: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      envelopes.push(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  dsn = `http://publickey@127.0.0.1:${(server.address() as AddressInfo).port}/1`;
});

afterAll(async () => {
  resetErrorReportingForTests();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('error reporting', () => {
  it('sends nothing at all when no DSN is configured', async () => {
    resetErrorReportingForTests();
    await initErrorReporting(undefined, 'test');

    reportError(new Error('unreported'), 'no dsn configured');
    await flushErrorReporting(500);

    expect(envelopes).toHaveLength(0);
  });

  it('delivers a captured exception, with the context the caller gave it', async () => {
    resetErrorReportingForTests();
    await initErrorReporting(dsn, 'test');

    reportError(new Error('kaboom'), 'outbox job threw', { outboxId: 'ob_42' });
    await flushErrorReporting(5000);

    const sent = envelopes.join('\n');
    expect(sent).toContain('kaboom');
    expect(sent).toContain('outbox job threw');
    expect(sent).toContain('ob_42');
    expect(sent).toContain('"environment":"test"');
  });
});
