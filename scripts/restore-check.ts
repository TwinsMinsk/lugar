/**
 * Proves that a dump of the production database restores, without the data leaving Railway.
 *
 * A Railway volume snapshot can only be restored over the volume it was taken from, so it cannot be
 * tested without overwriting production, and copying a dump to a laptop puts client data where it
 * does not belong. Instead, a throwaway `postgres:18` service in the same project runs
 * `restore-check.sh`: it dumps the database over the private network, restores the dump into a
 * cluster inside its own container and compares every table (row count and content hash) plus the
 * index and constraint counts. Its logs carry table names, counts and hashes, never row contents.
 * The service is deleted afterwards, whatever the outcome.
 *
 * Needs the Railway CLI, logged in, run from this directory linked to the project (`railway link`).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SERVICE_NAME = 'restore-check';
const ENVIRONMENT = 'production';
// The only EU region, as in .railway/railway.ts: the dump holds personal data of clients in Spain.
const REGION = 'europe-west4-drams3a';
const TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 10 * 1000;

const tmp = mkdtempSync(path.join(tmpdir(), 'lugar-restore-check-'));

function railway(args: string[], input?: string): string {
  // On Windows `railway` is an npm .cmd shim, which only a shell can start.
  const result =
    process.platform === 'win32'
      ? spawnSync(`railway ${args.join(' ')}`, { input, encoding: 'utf8', shell: true })
      : spawnSync('railway', args, { input, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`railway ${args[0]} failed: ${result.stderr || result.stdout || result.error}`);
  }
  return result.stdout;
}

function api<T>(query: string, variables: Record<string, unknown> = {}): T {
  const file = path.join(tmp, 'variables.json');
  writeFileSync(file, JSON.stringify(variables));
  const response = JSON.parse(railway(['api', '--variables', `"@${file}"`], query)) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (response.errors?.length || !response.data) {
    throw new Error(`Railway API: ${response.errors?.map((e) => e.message).join('; ')}`);
  }
  return response.data;
}

type Status = {
  id: string;
  environments: { edges: { node: { id: string; name: string } }[] };
  services: { edges: { node: { name: string } }[] };
};

async function main() {
  const status = JSON.parse(railway(['status', '--json'])) as Status;
  const projectId = status.id;
  const environmentId = status.environments.edges.find((e) => e.node.name === ENVIRONMENT)?.node.id;
  if (!environmentId)
    throw new Error(`Environment "${ENVIRONMENT}" not found in the linked project.`);
  if (status.services.edges.some((e) => e.node.name === SERVICE_NAME)) {
    throw new Error(`Service "${SERVICE_NAME}" already exists (a previous run?). Delete it first.`);
  }

  const script = readFileSync(path.resolve('scripts/restore-check.sh'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

  // Created without a source, so nothing starts before the start command and region are set.
  const { serviceCreate } = api<{ serviceCreate: { id: string } }>(
    'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }',
    {
      input: {
        projectId,
        environmentId,
        name: SERVICE_NAME,
        variables: {
          SRC: '${{Postgres.DATABASE_URL}}',
          CHECK_SCRIPT: Buffer.from(script).toString('base64'),
        },
      },
    },
  );
  const serviceId = serviceCreate.id;
  console.log(`Created service ${SERVICE_NAME} (${serviceId}).`);

  try {
    api(
      'mutation($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }',
      {
        serviceId,
        environmentId,
        input: {
          source: { image: 'postgres:18' },
          startCommand: "sh -c 'echo $CHECK_SCRIPT | base64 -d | sh'",
          restartPolicyType: 'NEVER',
          multiRegionConfig: { [REGION]: { numReplicas: 1 } },
        },
      },
    );
    const { serviceInstanceDeployV2: deploymentId } = api<{ serviceInstanceDeployV2: string }>(
      'mutation($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }',
      { serviceId, environmentId },
    );
    console.log(`Deployment ${deploymentId} started; waiting for the check to finish...`);

    const deadline = Date.now() + TIMEOUT_MS;
    let lines: string[] = [];
    let state = '';
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const data = api<{
        deploymentLogs: { message: string; timestamp: string }[];
        deployment: { status: string };
      }>(
        'query($id: String!) { deploymentLogs(deploymentId: $id, limit: 500) { message timestamp } deployment(id: $id) { status } }',
        { id: deploymentId },
      );
      lines = [...data.deploymentLogs]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map((l) => l.message);
      state = data.deployment.status;
      const finished = lines.some(
        (l) => l === 'restore-check: done' || l.startsWith('RESULT: FAIL'),
      );
      if (finished || ['FAILED', 'CRASHED', 'REMOVED'].includes(state)) break;
    }

    console.log(lines.join('\n'));
    if (lines.some((l) => l.startsWith('RESULT: OK'))) {
      console.log('\nRestore check passed.');
    } else {
      console.error(`\nRestore check did NOT pass (deployment status: ${state || 'unknown'}).`);
      process.exitCode = 1;
    }
  } finally {
    api('mutation($id: String!) { serviceDelete(id: $id) }', { id: serviceId });
    console.log(`Deleted service ${SERVICE_NAME}.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
