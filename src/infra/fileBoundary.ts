import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const DENIED_DIRECTORY_NAMES = new Set([
  'node_modules',
  'oh_modules',
  'build',
  '.hvigor',
  '.git',
]);

export class WorkspaceBoundaryError extends Error {
  readonly code:
    'WORKSPACE_NOT_FOUND' | 'WORKSPACE_NOT_DIRECTORY' | 'PATH_OUTSIDE_WORKSPACE' | 'PATH_DENIED';

  constructor(code: WorkspaceBoundaryError['code'], message: string) {
    super(message);
    this.name = 'WorkspaceBoundaryError';
    this.code = code;
  }
}

export function isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const relative = path.relative(workspaceRoot, targetPath);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function hasDeniedSegment(relativePath: string): boolean {
  return relativePath
    .split(path.sep)
    .filter(Boolean)
    .some((segment) => DENIED_DIRECTORY_NAMES.has(segment));
}

export async function resolveWorkspaceRoot(workspaceRoot: string): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(workspaceRoot);
  } catch {
    throw new WorkspaceBoundaryError(
      'WORKSPACE_NOT_FOUND',
      'workspaceRoot does not exist or is not readable.',
    );
  }

  const metadata = await stat(resolved);
  if (!metadata.isDirectory()) {
    throw new WorkspaceBoundaryError(
      'WORKSPACE_NOT_DIRECTORY',
      'workspaceRoot must resolve to a directory.',
    );
  }
  return resolved;
}

export async function resolvePathWithinWorkspace(
  workspaceRoot: string,
  candidatePath: string,
): Promise<string> {
  const lexicalTarget = path.resolve(workspaceRoot, candidatePath);
  if (!isWithinWorkspace(workspaceRoot, lexicalTarget)) {
    throw new WorkspaceBoundaryError(
      'PATH_OUTSIDE_WORKSPACE',
      'Requested path is outside workspaceRoot.',
    );
  }

  const relativeLexical = path.relative(workspaceRoot, lexicalTarget);
  if (hasDeniedSegment(relativeLexical)) {
    throw new WorkspaceBoundaryError('PATH_DENIED', 'Requested path is in an excluded directory.');
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await realpath(lexicalTarget);
  } catch {
    throw new WorkspaceBoundaryError('WORKSPACE_NOT_FOUND', 'Requested path does not exist.');
  }

  if (!isWithinWorkspace(workspaceRoot, resolvedTarget)) {
    throw new WorkspaceBoundaryError(
      'PATH_OUTSIDE_WORKSPACE',
      'Requested path resolves outside workspaceRoot.',
    );
  }

  const relativeResolved = path.relative(workspaceRoot, resolvedTarget);
  if (hasDeniedSegment(relativeResolved)) {
    throw new WorkspaceBoundaryError('PATH_DENIED', 'Requested path is in an excluded directory.');
  }

  return resolvedTarget;
}

export function toWorkspaceRelative(workspaceRoot: string, targetPath: string): string {
  return path.relative(workspaceRoot, targetPath).split(path.sep).join('/');
}
