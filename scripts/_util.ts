/**
 * Shared CLI helpers for the VideoForge pipeline scripts.
 *
 * Everything the scripts need to shell out deterministically, degrade with
 * elegance when a tool is missing, and read/write the JSON artefacts that flow
 * between modules. Kept dependency-free (Node built-ins only).
 */

import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export interface RunOpts {
  /** Working directory for the child process. */
  cwd?: string;
  /** Bytes of stdout to buffer before erroring (default 64 MiB). */
  maxBuffer?: number;
  /** If true, swallow non-zero exit and still return captured stdout. */
  allowFailure?: boolean;
  /** Extra env for the child. */
  env?: NodeJS.ProcessEnv;
}

interface ExecError extends Error {
  code?: string;
  status?: number | null;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
}

const DEFAULT_MAX_BUFFER = 1 << 26; // 64 MiB — enough for ffprobe JSON, frames go to disk.

/**
 * Run a command and return its stdout. Throws with rich context (exit code +
 * captured stderr) so failures are debuggable. Use for steps that MUST succeed.
 */
export function run(cmd: string, args: string[], opts: RunOpts = {}): string {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      encoding: "utf8",
      maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
    });
    return out;
  } catch (err) {
    const e = err as ExecError;
    if (opts.allowFailure && typeof e.stdout === "string") return e.stdout;
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : e.stderr
          ? e.stderr.toString("utf8")
          : "";
    const detail = [
      `command failed: ${cmd} ${args.join(" ")}`,
      e.status != null ? `exit=${e.status}` : e.code ? `code=${e.code}` : "",
      stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }
}

/**
 * Like {@link run} but returns null when the binary is absent (ENOENT), so a
 * caller can degrade to a stub instead of crashing. Other failures still throw.
 */
export function tryRun(
  cmd: string,
  args: string[],
  opts: RunOpts = {},
): string | null {
  try {
    return run(cmd, args, opts);
  } catch (err) {
    const e = err as ExecError;
    // execFileSync raises ENOENT for a missing binary; our run() wraps it, so
    // sniff the message too (the wrapped Error loses the original code).
    if (e.code === "ENOENT" || /code=ENOENT/.test(e.message)) return null;
    throw err;
  }
}

/**
 * True if an executable named `name` is resolvable on PATH. Pure filesystem
 * lookup — never executes the candidate (safe for unknown ML binaries).
 */
export function hasBinary(name: string): boolean {
  // Absolute/relative path given directly.
  if (name.includes("/")) {
    try {
      accessSync(name, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const path = process.env.PATH ?? "";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        /* keep scanning */
      }
    }
  }
  return false;
}

/** Read + parse a JSON artefact. Throws a clear error if missing/malformed. */
export function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`readJson: not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    throw new Error(`readJson: invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

/** Read JSON if present, else return the fallback (defensive artefact loading). */
export function readJsonOr<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

/** Write a JSON artefact (pretty, trailing newline), creating parent dirs. */
export function writeJson(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/** Ensure a directory exists; returns the path for chaining. */
export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

/**
 * True when this module's importer is the process entrypoint, i.e. it was run
 * as a CLI (`tsx scripts/foo.ts`) rather than imported. Robust across argv
 * quirks by comparing resolved file URLs.
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return importMetaUrl === pathToFileURL(entry).href;
}

/** Tiny sectioned logger. Everything goes to stderr so stdout stays pipeable. */
export const log = {
  section(title: string): void {
    process.stderr.write(`\n\x1b[1m▶ ${title}\x1b[0m\n`);
  },
  info(msg: string): void {
    process.stderr.write(`  ${msg}\n`);
  },
  item(msg: string): void {
    process.stderr.write(`    • ${msg}\n`);
  },
  ok(msg: string): void {
    process.stderr.write(`  \x1b[32m✓\x1b[0m ${msg}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`  \x1b[33m⚠\x1b[0m ${msg}\n`);
  },
  /** Loud, unmistakable marker that a step ran in DEGRADED mode. */
  degraded(msg: string): void {
    process.stderr.write(`  \x1b[35m◐ DEGRADED\x1b[0m ${msg}\n`);
  },
};

export { existsSync };
