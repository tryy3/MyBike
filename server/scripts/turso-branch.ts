/**
 * Create a Turso Cloud database branch seeded from an existing DB, then print
 * connection exports. Does not modify .env.
 *
 * Usage:
 *   npm run -w server db:branch
 *   npm run -w server db:branch -- --from mybike
 *   npm run -w server db:branch -- --name mybike-dev-custom
 *
 * Requires the `turso` CLI (logged in). Prefer a group token in TURSO_AUTH_TOKEN
 * so you only need to export TURSO_DATABASE_URL for the new branch.
 */
/// <reference types="node" />
import { spawnSync } from "node:child_process";

const DEFAULT_FROM = "mybike";
const NAME_PREFIX = "mybike-dev-";

function usage(exitCode = 1): never {
  console.error(`Usage: db:branch [--from <source-db>] [--name <branch-name>]

Creates a Turso database branch from an existing database and prints export
commands. Does not write .env.

Defaults:
  --from  $TURSO_BRANCH_FROM or "${DEFAULT_FROM}"
  --name  ${NAME_PREFIX}<git-short-sha>

If the name already exists, Turso will error — destroy it or pass --name.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): { from: string; name: string | null } {
  let from = process.env.TURSO_BRANCH_FROM?.trim() || DEFAULT_FROM;
  let name: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--from") {
      const value = argv[++i];
      if (!value) usage();
      from = value;
      continue;
    }
    if (arg === "--name") {
      const value = argv[++i];
      if (!value) usage();
      name = value;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
  }

  return { from, name };
}

function run(
  command: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `Command not found: ${command}. Install the Turso CLI and ensure it is on PATH.`,
      );
      process.exit(1);
    }
    throw result.error;
  }

  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function gitShortSha(): string {
  const result = run("git", ["rev-parse", "--short", "HEAD"]);
  if (result.status !== 0 || !result.stdout) {
    console.error("Could not resolve git short SHA. Pass --name or run from a git checkout.");
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  return result.stdout;
}

function ensureTursoCli(): void {
  const result = run("turso", ["--version"]);
  if (result.status !== 0) {
    console.error(
      "Turso CLI is required. Install from https://docs.turso.tech/cli and run `turso auth login`.",
    );
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
}

function main(): void {
  const { from, name: nameArg } = parseArgs(process.argv.slice(2));
  const name = nameArg ?? `${NAME_PREFIX}${gitShortSha()}`;

  ensureTursoCli();

  console.error(`Creating Turso branch "${name}" from "${from}"…`);
  const create = spawnSync("turso", ["db", "create", name, "--from-db", from, "--wait"], {
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });

  if (create.error) {
    if ((create.error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("Command not found: turso. Install the Turso CLI and ensure it is on PATH.");
      process.exit(1);
    }
    throw create.error;
  }

  if (create.status !== 0) {
    process.exit(create.status ?? 1);
  }

  const show = run("turso", ["db", "show", name, "--url"]);
  if (show.status !== 0 || !show.stdout) {
    console.error(`Created "${name}" but failed to resolve URL.`);
    if (show.stderr) console.error(show.stderr);
    process.exit(1);
  }

  const url = show.stdout;

  console.log(`Created Turso branch: ${name}`);
  console.log(`URL: ${url}`);
  console.log("");
  console.log(`export TURSO_DATABASE_URL='${url}'`);
  console.log("# Keep your existing group token as TURSO_AUTH_TOKEN (or mint one with:");
  console.log("#   turso group tokens create <group-name>");
  console.log("# )");
  console.log("");
  console.log(`# When finished: turso db destroy ${name}`);
}

main();
