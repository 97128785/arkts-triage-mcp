import { execFile } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';

export interface ProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessOutput>;
}

export class ProcessExecutionError extends Error {
  readonly code: 'EXECUTABLE_NOT_FOUND' | 'PROCESS_FAILED';

  constructor(code: ProcessExecutionError['code'], message: string) {
    super(message);
    this.name = 'ProcessExecutionError';
    this.code = code;
  }
}

function isMissingExecutable(error: ExecFileException): boolean {
  return error.code === 'ENOENT';
}

export const nodeProcessRunner: ProcessRunner = {
  run(request) {
    return new Promise((resolve, reject) => {
      execFile(
        request.executable,
        request.args,
        {
          cwd: request.cwd,
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024,
          shell: false,
          timeout: request.timeoutMs ?? 10_000,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ stdout, stderr, exitCode: 0 });
            return;
          }
          if (isMissingExecutable(error)) {
            reject(
              new ProcessExecutionError(
                'EXECUTABLE_NOT_FOUND',
                'Required executable was not found.',
              ),
            );
            return;
          }
          if (error.code === 1) {
            resolve({ stdout, stderr, exitCode: 1 });
            return;
          }
          reject(
            new ProcessExecutionError(
              'PROCESS_FAILED',
              `Process exited with code ${String(error.code ?? 'unknown')}.`,
            ),
          );
        },
      );
    });
  },
};
