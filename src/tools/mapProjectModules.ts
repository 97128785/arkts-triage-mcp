import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  DENIED_DIRECTORY_NAMES,
  hasDeniedSegment,
  isWithinWorkspace,
  resolvePathWithinWorkspace,
  resolveWorkspaceRoot,
  toWorkspaceRelative,
} from '../infra/fileBoundary.js';
import { readJson5WithinWorkspace } from '../infra/json5Reader.js';
import type {
  MetadataWarning,
  ModuleDependency,
  ModuleMapReport,
  ProjectModule,
} from '../domain/workspace.js';
import { MODULE_MAP_SCHEMA_VERSION } from '../domain/workspace.js';

const MAX_DISCOVERED_ENTRIES = 20_000;

type JsonObject = Record<string, unknown>;

interface ModuleAccumulator {
  path: string;
  declaredName?: string;
  packageName?: string;
  profileName?: string;
  relation: 'declared' | 'inferred';
  moduleType?: string;
  sourceFiles: Set<string>;
  dependencySpecifiers: Map<string, string>;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isAllowedMetadataPath(relativePath: string): boolean {
  return (
    relativePath === 'build-profile.json5' ||
    relativePath === 'oh-package.json5' ||
    relativePath === 'oh-package-lock.json5' ||
    relativePath.endsWith('/oh-package.json5') ||
    relativePath.endsWith('/src/main/module.json5')
  );
}

async function discoverMetadataFiles(workspaceRoot: string): Promise<string[]> {
  const discovered: string[] = [];
  let visitedEntries = 0;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > MAX_DISCOVERED_ENTRIES) {
        throw new Error(`Workspace metadata scan exceeded ${MAX_DISCOVERED_ENTRIES} entries.`);
      }
      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toWorkspaceRelative(workspaceRoot, absolutePath);
      if (hasDeniedSegment(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!DENIED_DIRECTORY_NAMES.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }
      if (entry.isFile() && isAllowedMetadataPath(relativePath)) {
        discovered.push(relativePath);
      }
    }
  }

  await walk(workspaceRoot);
  return discovered.sort();
}

function getOrCreateModule(
  modules: Map<string, ModuleAccumulator>,
  modulePath: string,
): ModuleAccumulator {
  const normalizedPath = modulePath === '' ? '.' : modulePath;
  const existing = modules.get(normalizedPath);
  if (existing) {
    return existing;
  }
  const created: ModuleAccumulator = {
    path: normalizedPath,
    relation: 'inferred',
    sourceFiles: new Set<string>(),
    dependencySpecifiers: new Map<string, string>(),
  };
  modules.set(normalizedPath, created);
  return created;
}

function collectDependencies(value: unknown, target: Map<string, string>): void {
  const dependencies = asObject(value);
  if (!dependencies) {
    return;
  }
  for (const [name, specifier] of Object.entries(dependencies)) {
    if (typeof specifier === 'string') {
      target.set(name, specifier);
    }
  }
}

function moduleName(module: ModuleAccumulator): string {
  return (
    module.declaredName ??
    module.packageName ??
    module.profileName ??
    path.posix.basename(module.path)
  );
}

function dependencyTarget(
  dependencyName: string,
  specifier: string,
  fromModule: ModuleAccumulator,
  modules: ModuleAccumulator[],
): { to: string; kind: 'workspace' | 'package' } {
  const byPackageName = modules.find(
    (candidate) =>
      candidate.packageName === dependencyName || moduleName(candidate) === dependencyName,
  );
  if (byPackageName) {
    return { to: moduleName(byPackageName), kind: 'workspace' };
  }

  const localPath = specifier.startsWith('file:') ? specifier.slice(5) : specifier;
  if (localPath.startsWith('.') || localPath.startsWith('/')) {
    const fromDirectory = fromModule.path === '.' ? '' : fromModule.path;
    const resolvedRelative = path.posix.normalize(path.posix.join(fromDirectory, localPath));
    const byPath = modules.find((candidate) => candidate.path === resolvedRelative);
    if (byPath) {
      return { to: moduleName(byPath), kind: 'workspace' };
    }
  }
  return { to: dependencyName, kind: 'package' };
}

export async function mapProjectModules(input: {
  workspaceRoot: string;
}): Promise<ModuleMapReport> {
  const workspaceRoot = await resolveWorkspaceRoot(input.workspaceRoot);
  const metadataFiles = await discoverMetadataFiles(workspaceRoot);
  const warnings: MetadataWarning[] = [];
  const modules = new Map<string, ModuleAccumulator>();
  let lockfileSummary: ModuleMapReport['lockfileSummary'];

  const buildProfilePath = metadataFiles.find((file) => file === 'build-profile.json5');
  if (buildProfilePath) {
    const result = await readJson5WithinWorkspace<JsonObject>(workspaceRoot, buildProfilePath);
    if (!result.ok) {
      warnings.push({ file: buildProfilePath, message: result.error.message });
    } else {
      const declaredModules = Array.isArray(result.value.modules) ? result.value.modules : [];
      for (const rawModule of declaredModules) {
        const declaredModule = asObject(rawModule);
        const name = asString(declaredModule?.name);
        const srcPath = asString(declaredModule?.srcPath);
        if (!name || !srcPath) {
          warnings.push({
            file: buildProfilePath,
            message: 'A module entry is missing a string name or srcPath.',
          });
          continue;
        }

        const lexicalPath = path.resolve(workspaceRoot, srcPath);
        if (
          !isWithinWorkspace(workspaceRoot, lexicalPath) ||
          hasDeniedSegment(path.relative(workspaceRoot, lexicalPath))
        ) {
          warnings.push({
            file: buildProfilePath,
            message: `Module ${name} points outside the allowed workspace boundary.`,
          });
          continue;
        }
        try {
          const resolvedPath = await resolvePathWithinWorkspace(workspaceRoot, lexicalPath);
          const relativePath = toWorkspaceRelative(workspaceRoot, resolvedPath);
          const module = getOrCreateModule(modules, relativePath);
          module.declaredName = name;
          module.relation = 'declared';
          module.sourceFiles.add(buildProfilePath);
        } catch {
          warnings.push({
            file: buildProfilePath,
            message: `Module ${name} has a missing, unreadable, or escaped srcPath.`,
          });
        }
      }
    }
  }

  for (const metadataFile of metadataFiles) {
    if (metadataFile.endsWith('/src/main/module.json5')) {
      const modulePath = metadataFile.slice(0, -'/src/main/module.json5'.length);
      const module = getOrCreateModule(modules, modulePath);
      module.sourceFiles.add(metadataFile);
      const result = await readJson5WithinWorkspace<JsonObject>(workspaceRoot, metadataFile);
      if (!result.ok) {
        warnings.push({ file: metadataFile, message: result.error.message });
        continue;
      }
      const profile = asObject(result.value.module);
      const profileName = asString(profile?.name);
      const moduleType = asString(profile?.type);
      if (profileName) {
        module.profileName = profileName;
      }
      if (moduleType) {
        module.moduleType = moduleType;
      }
      continue;
    }

    if (metadataFile.endsWith('oh-package.json5')) {
      const modulePath =
        metadataFile === 'oh-package.json5' ? '.' : path.posix.dirname(metadataFile);
      const module = getOrCreateModule(modules, modulePath);
      module.sourceFiles.add(metadataFile);
      const result = await readJson5WithinWorkspace<JsonObject>(workspaceRoot, metadataFile);
      if (!result.ok) {
        warnings.push({ file: metadataFile, message: result.error.message });
        continue;
      }
      const packageName = asString(result.value.name);
      if (packageName) {
        module.packageName = packageName;
      }
      collectDependencies(result.value.dependencies, module.dependencySpecifiers);
      continue;
    }

    if (metadataFile === 'oh-package-lock.json5') {
      const result = await readJson5WithinWorkspace<JsonObject>(workspaceRoot, metadataFile);
      if (!result.ok) {
        warnings.push({ file: metadataFile, message: result.error.message });
        continue;
      }
      const packages = asObject(result.value.packages) ?? asObject(result.value.dependencies);
      lockfileSummary = {
        file: metadataFile,
        packageCount: packages ? Object.keys(packages).length : 0,
      };
    }
  }

  const moduleValues = [...modules.values()];
  const dependencies: ModuleDependency[] = [];
  for (const module of moduleValues) {
    for (const [name, specifier] of module.dependencySpecifiers) {
      const target = dependencyTarget(name, specifier, module, moduleValues);
      dependencies.push({
        from: moduleName(module),
        to: target.to,
        specifier,
        kind: target.kind,
      });
    }
  }

  const mappedModules: ProjectModule[] = moduleValues
    .map((module) => ({
      name: moduleName(module),
      path: module.path,
      relation: module.relation,
      ...(module.moduleType ? { moduleType: module.moduleType } : {}),
      sourceFiles: [...module.sourceFiles].sort(),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: MODULE_MAP_SCHEMA_VERSION,
    modules: mappedModules,
    dependencies: dependencies.sort((left, right) =>
      `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
    ),
    ...(lockfileSummary ? { lockfileSummary } : {}),
    warnings,
  };
}
