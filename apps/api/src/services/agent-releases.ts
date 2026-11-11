/**
 * Speaker agent releases and sounds bundled into the API image (Phase 24).
 * Files live in apps/speaker-agent/{releases,sounds}; the Dockerfile copies
 * them next to the API. Checksums are computed once, on first use.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_DIR =
  process.env.SPEAKER_AGENT_DIR ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../speaker-agent");

export interface BundledFile {
  name: string;
  file: string;
  sha256: string;
}
export interface AgentRelease extends BundledFile {
  version: string;
}

let releases: AgentRelease[] | null = null;
let sounds: BundledFile[] | null = null;

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every bundled release, oldest first. */
export function listReleases(): AgentRelease[] {
  if (releases) return releases;
  const dir = path.join(AGENT_DIR, "releases");
  releases = safeList(dir)
    .map((name) => ({ name, match: /^agent-(\d+\.\d+\.\d+)\.py$/.exec(name) }))
    .filter((x): x is { name: string; match: RegExpExecArray } => !!x.match)
    .map(({ name, match }) => {
      const file = path.join(dir, name);
      return { name, file, version: match[1], sha256: sha256(file) };
    })
    .sort((a, b) => compareSemver(a.version, b.version));
  return releases;
}

export function latestRelease(): AgentRelease | null {
  const all = listReleases();
  return all.length > 0 ? all[all.length - 1] : null;
}

export function getRelease(version: string): AgentRelease | null {
  return listReleases().find((r) => r.version === version) ?? null;
}

/** The release a speaker should run: its pinned version, else the latest. */
export function releaseFor(pinned: string | null): AgentRelease | null {
  return pinned ? getRelease(pinned) : latestRelease();
}

/** Built-in sounds served to speakers (beeps, chime). */
export function listSounds(): BundledFile[] {
  if (sounds) return sounds;
  const dir = path.join(AGENT_DIR, "sounds");
  sounds = safeList(dir)
    .filter((n) => /^[a-z]+\.wav$/.test(n))
    .map((n) => {
      const file = path.join(dir, n);
      return { name: n.replace(/\.wav$/, ""), file, sha256: sha256(file) };
    });
  return sounds;
}

export function getSound(name: string): BundledFile | null {
  return listSounds().find((s) => s.name === name) ?? null;
}

export function readBundled(file: BundledFile): Buffer {
  return readFileSync(file.file);
}
