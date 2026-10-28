// Runs skirmora-api in this process with an in-memory session store: online play on
// localhost with no Supabase and no CORS setup (plan prerequisites).
//
//   npm run api:memory          → http://localhost:8080, CORS for http://localhost:4200
//
// It loads the API's committed build (`../skirmora-api/dist`, or SKIRMORA_API) and
// wires the same runtime the server uses, with InMemorySessionRepository and InMemoryBus instead
// of Supabase. Rooms vanish when it stops. Only for development.
import http from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, process.env.SKIRMORA_API ?? '../skirmora-api');
if (!existsSync(join(apiDir, 'dist', 'runtime.js'))) {
  console.error(`memory-api: no build at ${apiDir}/dist — run \`npm run build\` in skirmora-api`);
  process.exit(1);
}

// before the API reads its env: dotenv never overrides what is already set
process.env.CORS_ORIGINS ??= 'http://localhost:4200';
const port = Number(process.env.PORT ?? 8080);

const require = createRequire(join(apiDir, 'package.json'));
const { createRuntime } = require('./dist/runtime.js');
const { InMemorySessionRepository } = require('./dist/services/sessionRepository.memory.js');
const { InMemoryBus } = require('./dist/realtime/sessionBus.js');

const runtime = createRuntime({ repository: new InMemorySessionRepository(), bus: new InMemoryBus() });
const server = http.createServer(runtime.app);
runtime.attachRealtime(server);
server.listen(port, 'localhost', () => {
  console.log(`memory-api: skirmora-api on http://localhost:${port} (in memory, CORS ${process.env.CORS_ORIGINS})`);
});
