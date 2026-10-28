/**
 * Railway infrastructure for the `lugar` project, environment `production`.
 *
 * Replaces Config as Code (`railway.json`), which Railway stops reading on 2026-12-01. Railway does
 * not read this file on deploy: changes reach the project only through `railway config plan` and
 * `railway config apply`, run by a person. Omitting a resource here means deleting it on apply.
 *
 * Variables stay unmanaged: secrets live in Railway, never in this file.
 */
import { defineRailway, github, postgres, project, service, volume } from 'railway/iac';

// Railway's only EU region: the database holds personal data of clients in Spain.
const REGION = 'europe-west4-drams3a';

export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: 'ams' });
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } };

  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'ams',
    sizeMB: 5000,
  });
  const lugarWebVolume = volume('lugar-web-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'ams',
    sizeMB: 10000,
  });

  // One replica: the default Next cache handler is per-instance (docs/architecture.md §5), and a
  // volume cannot be shared between two processes.
  const lugarWeb = service('lugar-web', {
    source: github('TwinsMinsk/lugar', { branch: 'main', checkSuites: true }),
    build: { buildEnvironment: 'V3', builder: 'RAILPACK' },
    start: 'HOSTNAME=0.0.0.0 node .next/standalone/server.js',
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    preDeploy: 'npm run db:migrate',
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    domains: ['lugaroficial.es', 'www.lugaroficial.es'],
    volumeMounts: { '/data/media': lugarWebVolume },
  });

  // The outbox worker runs from source with tsx: no build, no HTTP server, so no healthcheck, and
  // no migrations — the web service owns the schema. Waits for CI like the web service, so the two
  // never run different commits against the same schema.
  const lugarWorker = service('lugar-worker', {
    source: github('TwinsMinsk/lugar', { branch: 'main', checkSuites: true }),
    build: {
      buildCommand: 'echo "the worker runs from source with tsx, no build step"',
      buildEnvironment: 'V3',
      builder: 'RAILPACK',
    },
    start: 'npm run worker',
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: 'ALWAYS' },
  });

  return project('lugar', {
    variables: { managed: false },
    resources: [lugarWorker, lugarWeb, Postgres, postgresVolume, lugarWebVolume],
  });
});
