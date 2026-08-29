import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TEMP_PREFIX = "family-motivation-integration-";
const DATABASE_NAME = "family_motivation_integration";
const TEST_TMP_ROOT = "/tmp";

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port || port === 5432) return freePort();
  return port;
}

async function postgresBinaries() {
  const { stdout } = await execFileAsync("pg_config", ["--bindir"]);
  const bin = stdout.trim();
  return {
    initdb: join(bin, "initdb"),
    pgCtl: join(bin, "pg_ctl"),
    createdb: join(bin, "createdb"),
  };
}

export async function startTestPostgres() {
  const root = await mkdtemp(join(TEST_TMP_ROOT, TEMP_PREFIX));
  const dataDir = join(root, "data");
  const socketDir = join(root, "socket");
  await mkdir(socketDir);
  const port = await freePort();
  const binaries = await postgresBinaries();
  try {
    await execFileAsync(binaries.initdb, ["-D", dataDir, "--username=postgres", "--no-locale", "--encoding=UTF8", "--auth=trust"]);
    await execFileAsync(binaries.pgCtl, [
      "-D", dataDir,
      "-l", join(root, "postgres.log"),
      "-o", `-h 127.0.0.1 -p ${port} -k ${socketDir}`,
      "-w", "start",
    ]);
    await execFileAsync(binaries.createdb, ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", DATABASE_NAME]);
  } catch (error) {
    try {
      await execFileAsync(binaries.pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
    } catch {
      // The server may not have reached a running state; cleanup is still safe.
    } finally {
      if (!root.startsWith(join(TEST_TMP_ROOT, TEMP_PREFIX))) throw new Error("Refusing unsafe test cleanup");
      await rm(root, { recursive: true, force: true });
    }
    throw error;
  }

  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${DATABASE_NAME}?schema=public`;
  const parsed = new URL(databaseUrl);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port === "5432" ||
    parsed.pathname !== `/${DATABASE_NAME}` ||
    !root.startsWith(join(TEST_TMP_ROOT, TEMP_PREFIX))
  ) {
    throw new Error("Unsafe integration database target");
  }

  let stopped = false;
  return {
    databaseUrl,
    port,
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await execFileAsync(binaries.pgCtl, ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      } finally {
        if (!root.startsWith(join(TEST_TMP_ROOT, TEMP_PREFIX))) throw new Error("Refusing unsafe test cleanup");
        await rm(root, { recursive: true, force: true });
      }
    },
  };
}

export async function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}`)));
  });
}
