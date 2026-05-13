import { mkdir, rm } from "fs/promises";

export async function mkTmpDir(prefix: string): Promise<string> {
  const dir = `tests/.tmp/${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function rmrf(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
