import { readFile } from 'node:fs/promises';
import JSON5 from 'json5';
import { err, ok, type Result } from '../domain/result.js';
import { resolvePathWithinWorkspace } from './fileBoundary.js';

export interface Json5ReadError {
  code: 'NOT_FOUND_OR_DENIED' | 'INVALID_JSON5';
  message: string;
}

export async function readJson5WithinWorkspace<T>(
  workspaceRoot: string,
  filePath: string,
): Promise<Result<T, Json5ReadError>> {
  let resolvedPath: string;
  try {
    resolvedPath = await resolvePathWithinWorkspace(workspaceRoot, filePath);
  } catch {
    return err({
      code: 'NOT_FOUND_OR_DENIED',
      message: 'Metadata file is missing, unreadable, or outside workspaceRoot.',
    });
  }

  try {
    const source = await readFile(resolvedPath, 'utf8');
    return ok(JSON5.parse(source) as T);
  } catch {
    return err({
      code: 'INVALID_JSON5',
      message: 'Metadata file could not be parsed as JSON5.',
    });
  }
}
