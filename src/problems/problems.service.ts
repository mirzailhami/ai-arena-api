import { Injectable } from '@nestjs/common'
import { Problem } from '@prisma/client'
import { execFile } from 'child_process'
import { promises as fs, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, resolve } from 'path'
import { promisify } from 'util'

import { ResponseObject, responseOf } from '../common/api-response'
import { PrismaService } from '../prisma/prisma.service'
import { LoggerService } from '../shared/modules/global/logger.service'
import { SourceProblem } from './problem.types'

const execFileAsync = promisify(execFile)
const ARENA_BASE_DOCKERFILE_TEMPLATE =
  'FROM tomcat:9.0.80-jdk11-temurin\n' +
  'ENV DEBIAN_FRONTEND=noninteractive\n' +
  'RUN apt-get update && apt-get install -y --no-install-recommends curl gnupg build-essential maven python3 python3-pip && rm -rf /var/lib/apt/lists/*\n' +
  'RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs\n' +
  'RUN node -v\n' +
  'RUN npm -v\n' +
  'RUN python3 --version\n' +
  'RUN pip3 --version\n' +
  'RUN mvn --version\n' +
  'WORKDIR /app\n' +
  'RUN rm -rf /usr/local/tomcat/webapps/*\n' +
  '%s' +
  'EXPOSE 8080\n' +
  'CMD ["catalina.sh", "run"]\n'

@Injectable()
export class ProblemsService {
  private readonly logger = LoggerService.forRoot('ProblemsService')

  constructor(private readonly prisma: PrismaService) {}

  async uploadProblem(
    payload: Buffer | undefined,
    contentDisposition: string,
    problemNameHeader?: string,
  ): Promise<ResponseObject<SourceProblem>> {
    this.logger.log({
      action: 'uploadProblem',
      contentDisposition,
      payloadBytes: payload?.length ?? 0,
      problemNameHeader: problemNameHeader ?? null,
    })

    if (!payload?.length) {
      return responseOf(null as never, false, 'Upload body is empty.')
    }

    const originalFilename = this.extractFilename(contentDisposition)
    const created = await this.prisma.problem.create({
      data: {
        problemName:
          problemNameHeader?.trim() || originalFilename.replace(/\.zip$/i, ''),
        zipFileName: originalFilename,
      },
    })

    const problemDir = this.getProblemDir(created.id)
    await fs.mkdir(problemDir, { recursive: true })
    this.logger.debug({
      action: 'uploadProblem.mkdir',
      problemDir,
      problemId: created.id,
    })

    try {
      await fs.writeFile(join(problemDir, originalFilename), payload)
      this.logger.log({
        action: 'uploadProblem.success',
        problemId: created.id,
        zipFileName: originalFilename,
      })
      return responseOf(
        this.toSourceProblem(created),
        true,
        `Problem uploaded successfully. ID: ${created.id}`,
      )
    } catch (error) {
      await this.prisma.problem.delete({ where: { id: created.id } })
      await fs.rm(problemDir, { force: true, recursive: true })
      this.logger.error({
        action: 'uploadProblem.failure',
        error: this.errorMessage(error),
        problemId: created.id,
      })
      return responseOf(
        null as never,
        false,
        `Failed to process upload: ${this.errorMessage(error)}`,
      )
    }
  }

  async testProblem(problemId: string): Promise<ResponseObject<string>> {
    this.logger.log({ action: 'testProblem.start', problemId })
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    })
    if (!problem) {
      this.logger.warn({ action: 'testProblem.problemNotFound', problemId })
      return responseOf(
        null as never,
        false,
        `Error: Problem metadata not found for ID ${problemId}`,
      )
    }

    await this.prisma.problem.update({
      data: { status: 'Testing' },
      where: { id: problemId },
    })

    const problemDir = this.getProblemDir(problemId)
    const zipPath = join(problemDir, problem.zipFileName)
    const explodedDir = join(
      problemDir,
      problem.zipFileName.replace(/\.zip$/i, ''),
    )
    let fullLog = ''

    try {
      this.logger.debug({
        action: 'testProblem.paths',
        explodedDir,
        problemDir,
        problemId,
        zipPath,
      })
      await this.extractZip(zipPath, explodedDir)
      const effectiveDockerContext =
        await this.findEffectiveDockerContext(explodedDir)
      const dockerfilePath = join(effectiveDockerContext, 'Dockerfile')
      await fs.access(dockerfilePath)
      this.logger.log({
        action: 'testProblem.contextResolved',
        dockerfilePath,
        effectiveDockerContext,
        problemId,
      })

      const dockerfileContents = await fs.readFile(dockerfilePath, 'utf8')
      const copiedWarPath = await this.copyArenaWarIfConfigured(
        effectiveDockerContext,
      )
      const mergedDockerfilePath = join(
        effectiveDockerContext,
        'Dockerfile.arena',
      )
      await fs.writeFile(
        mergedDockerfilePath,
        this.mergeDockerfiles(dockerfileContents, Boolean(copiedWarPath)),
        'utf8',
      )
      this.logger.debug({
        action: 'testProblem.dockerfileMerged',
        copiedWarPath,
        mergedDockerfilePath,
        problemId,
      })

      const imageTag = `arena-problem-${problemId.replace(/-/g, '')}`
      this.logger.log({
        action: 'docker.build.start',
        context: effectiveDockerContext,
        imageTag,
        problemId,
      })
      const buildResult = await this.runCommand(
        'docker',
        ['build', '-f', 'Dockerfile.arena', '-t', imageTag, '.'],
        effectiveDockerContext,
      )
      fullLog += `--- BUILD OUTPUT ---\n${buildResult.output}`
      this.logger.log({
        action: 'docker.build.finish',
        exitCode: buildResult.exitCode,
        imageTag,
        problemId,
      })
      this.logger.verbose(
        `docker.build.output(problemId=${problemId})\n${buildResult.output}`,
      )

      if (buildResult.exitCode !== 0) {
        this.logger.warn({
          action: 'docker.build.failed',
          imageTag,
          problemId,
        })
        await this.persistProblemTestResult(problemId, 'Failed', false, fullLog)
        return responseOf(fullLog, false, 'Docker build failed. See output.')
      }

      const probeContainerName = `arena-probe-${problemId.replace(/-/g, '')}`
      this.logger.log({
        action: 'docker.run.start',
        imageTag,
        probeContainerName,
        problemId,
      })
      const runResult = await this.runCommand(
        'docker',
        ['run', '-d', '--name', probeContainerName, imageTag],
        effectiveDockerContext,
      )
      fullLog += `\n--- DEPLOY OUTPUT ---\n${runResult.output}`
      this.logger.log({
        action: 'docker.run.finish',
        exitCode: runResult.exitCode,
        probeContainerName,
        problemId,
      })
      this.logger.verbose(
        `docker.run.output(problemId=${problemId})\n${runResult.output}`,
      )

      const containerId = runResult.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      let deploySuccessful = runResult.exitCode === 0 && Boolean(containerId)

      if (containerId) {
        this.logger.debug({
          action: 'docker.container.id',
          containerId,
          problemId,
        })
        const inspectResult = await this.runCommand(
          'docker',
          ['inspect', '--format', '{{.State.Running}}', containerId],
          effectiveDockerContext,
        )
        fullLog += `\n--- INSPECT OUTPUT ---\n${inspectResult.output}`
        deploySuccessful =
          deploySuccessful && inspectResult.output.trim().startsWith('true')
        this.logger.log({
          action: 'docker.inspect.finish',
          deploySuccessful,
          exitCode: inspectResult.exitCode,
          problemId,
          running: inspectResult.output.trim(),
        })

        if (!deploySuccessful) {
          const logsResult = await this.runCommand(
            'docker',
            ['logs', containerId],
            effectiveDockerContext,
          )
          fullLog += `\n--- CONTAINER LOGS ---\n${logsResult.output}`
          this.logger.verbose(
            `docker.container.logs(problemId=${problemId})\n${logsResult.output}`,
          )
        }

        await this.runCommand(
          'docker',
          ['stop', containerId],
          effectiveDockerContext,
        )
        await this.runCommand(
          'docker',
          ['rm', containerId],
          effectiveDockerContext,
        )
        this.logger.log({
          action: 'docker.container.cleanup',
          containerId,
          problemId,
        })
      }

      if (copiedWarPath) {
        await fs.rm(copiedWarPath, { force: true })
        this.logger.debug({
          action: 'testProblem.cleanupCopiedWar',
          copiedWarPath,
          problemId,
        })
      }

      const testSuccessful = deploySuccessful
      await this.persistProblemTestResult(
        problemId,
        testSuccessful ? 'Passed' : 'Failed',
        testSuccessful,
        fullLog,
      )
      this.logger.log({
        action: 'testProblem.finish',
        problemId,
        status: testSuccessful ? 'Passed' : 'Failed',
      })

      return responseOf(
        fullLog,
        testSuccessful,
        testSuccessful
          ? 'Problem tested successfully.'
          : 'Testing failed: container deploy/verify step failed. See build log.',
      )
    } catch (error) {
      fullLog += `\n--- ERROR ---\n${this.errorMessage(error)}\n`
      this.logger.error({
        action: 'testProblem.error',
        error: this.errorMessage(error),
        problemId,
      })
      await this.persistProblemTestResult(problemId, 'Failed', false, fullLog)
      return responseOf(
        fullLog,
        false,
        `Testing failed due to an error during explosion or Docker execution: ${this.errorMessage(error)}`,
      )
    } finally {
      await fs.rm(explodedDir, { force: true, recursive: true })
      this.logger.debug({
        action: 'testProblem.cleanupExplodedDir',
        explodedDir,
        problemId,
      })
    }
  }

  async getProblemLog(
    problemId: string,
  ): Promise<ResponseObject<string | null>> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    })
    if (!problem) {
      return responseOf(null, false, `Problem ${problemId} not found.`)
    }

    return responseOf(
      problem.buildLog ?? null,
      problem.buildLog !== null,
      problem.buildLog
        ? 'Build log retrieved successfully.'
        : `No build log found for problem ${problemId}. Run a test first.`,
    )
  }

  async listProblems(): Promise<ResponseObject<SourceProblem[]>> {
    const problems = await this.prisma.problem.findMany({
      orderBy: { uploadedAt: 'desc' },
    })

    return responseOf(
      problems.map((problem) => this.toSourceProblem(problem)),
      true,
      `Retrieved ${problems.length} problems.`,
    )
  }

  async getProblem(
    problemId: string,
  ): Promise<ResponseObject<SourceProblem | null>> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    })
    if (!problem) {
      return responseOf(
        null,
        false,
        `Error: Problem ID ${problemId} not found.`,
      )
    }

    return responseOf(
      this.toSourceProblem(problem),
      true,
      'Problem metadata retrieved successfully.',
    )
  }

  async deleteProblem(problemId: string): Promise<ResponseObject<null>> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    })
    if (!problem) {
      return responseOf(null, false, `Problem not found: ${problemId}`)
    }

    await fs.rm(this.getProblemDir(problemId), {
      force: true,
      recursive: true,
    })
    await this.prisma.problem.delete({ where: { id: problemId } })

    return responseOf(null, true, `Problem ${problemId} deleted successfully.`)
  }

  async flagProblem(
    problemId: string,
    isContestReadyInput:
      | boolean
      | { isContestReady?: boolean | string }
      | string,
  ): Promise<ResponseObject<SourceProblem | null>> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    })
    if (!problem) {
      return responseOf(
        null,
        false,
        `Error: Problem ID ${problemId} not found.`,
      )
    }

    const isContestReady =
      typeof isContestReadyInput === 'boolean'
        ? isContestReadyInput
        : typeof isContestReadyInput === 'string'
          ? isContestReadyInput === 'true'
          : isContestReadyInput?.isContestReady === true ||
            isContestReadyInput?.isContestReady === 'true'

    if (isContestReady && !problem.isTested) {
      return responseOf(
        this.toSourceProblem(problem),
        false,
        'Problem must be tested successfully before marking as Contest Ready.',
      )
    }

    const updated = await this.prisma.problem.update({
      data: { isContestReady },
      where: { id: problemId },
    })

    return responseOf(
      this.toSourceProblem(updated),
      true,
      `Problem ${problemId} successfully ${isContestReady ? 'marked as Contest Ready' : 'unmarked from Contest Ready'}.`,
    )
  }

  private async persistProblemTestResult(
    problemId: string,
    status: string,
    isTested: boolean,
    buildLog: string,
  ): Promise<void> {
    const result = await this.prisma.problem.updateMany({
      data: {
        buildLog,
        isTested,
        status,
      },
      where: { id: problemId },
    })

    if (result.count === 0) {
      this.logger.warn({
        action: 'persistProblemTestResult.problemMissing',
        isTested,
        problemId,
        status,
      })
    }
  }

  private toSourceProblem(problem: Problem): SourceProblem {
    return {
      description: problem.description,
      isContestReady: problem.isContestReady,
      isTested: problem.isTested,
      problemId: problem.id,
      problemName: problem.problemName,
      status: problem.status,
      uploadDate: problem.uploadedAt.toISOString(),
      zipFileName: problem.zipFileName,
    }
  }

  private getProblemDir(problemId: string): string {
    return join(this.getDataRoot(), 'problems', problemId)
  }

  private getDataRoot(): string {
    const configuredRoot = this.getConfiguredValue(
      ['AI_ARENA_API_DATA_ROOT', 'ARENA_MANAGER_DATA_ROOT'],
      'arena.manager.data.root',
    )

    if (!configuredRoot) {
      return resolve(process.cwd(), 'data')
    }

    return resolve(process.cwd(), configuredRoot)
  }

  private extractFilename(contentDisposition: string): string {
    const match = /filename="?([^"]+)"?/i.exec(contentDisposition)
    return basename(match?.[1] ?? 'problem.zip')
  }

  private async extractZip(
    zipPath: string,
    destination: string,
  ): Promise<void> {
    this.logger.verbose({ action: 'extractZip.start', destination, zipPath })
    await fs.mkdir(destination, { recursive: true })
    await this.validateZipEntries(zipPath, destination)

    if (process.platform === 'win32') {
      const result = await this.runCommand(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
        ],
        tmpdir(),
      )
      if (result.exitCode !== 0) {
        throw new Error(result.output || `Failed to extract ${zipPath}`)
      }
      this.logger.log({
        action: 'extractZip.finish',
        mode: 'powershell',
        zipPath,
      })
      return
    }

    const result = await this.runCommand(
      'unzip',
      ['-o', zipPath, '-d', destination],
      tmpdir(),
    )
    if (result.exitCode !== 0) {
      throw new Error(result.output || `Failed to extract ${zipPath}`)
    }
    this.logger.log({ action: 'extractZip.finish', mode: 'unzip', zipPath })
  }

  private async findEffectiveDockerContext(
    initialDirectory: string,
  ): Promise<string> {
    let currentPath = initialDirectory
    this.logger.verbose(
      `Starting effective context search from: ${initialDirectory}`,
    )

    try {
      await fs.access(currentPath)
    } catch {
      this.logger.verbose(
        `Initial path does not exist, returning: ${currentPath}`,
      )
      return currentPath
    }

    while (true) {
      try {
        await fs.access(join(currentPath, 'Dockerfile'))
        this.logger.verbose(
          `Found Dockerfile, setting effective path: ${currentPath}`,
        )
        return currentPath
      } catch {
        // Continue drilling down.
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true })
      const relevantEntries = entries.filter((entry) => {
        const name = entry.name
        return (
          name !== '.' &&
          name !== '..' &&
          name !== '.metadata.json' &&
          !name.startsWith('.') &&
          name !== '__MACOSX' &&
          name !== 'Thumbs.db'
        )
      })

      if (relevantEntries.length === 1 && relevantEntries[0].isDirectory()) {
        currentPath = join(currentPath, relevantEntries[0].name)
        this.logger.verbose(
          `Drill down to single wrapped directory: ${currentPath}`,
        )
        continue
      }

      this.logger.verbose(
        `Stopped drilling down. Relevant content size: ${relevantEntries.length}. Path: ${currentPath}`,
      )
      this.logger.verbose(
        `Final effective context determined as: ${currentPath}`,
      )
      return currentPath
    }
  }

  private mergeDockerfiles(
    problemDockerfileContent: string,
    includeArenaWar: boolean,
  ): string {
    const warLine = includeArenaWar
      ? 'ADD synthetica2.war /usr/local/tomcat/webapps/synthetica2.war\n'
      : '# synthetica2.war not available - ADD skipped\n'
    const arenaBaseDockerfile = ARENA_BASE_DOCKERFILE_TEMPLATE.replace(
      '%s',
      warLine,
    )
    const problemInstructions = problemDockerfileContent
      .split(/\r?\n/)
      .slice(1)
      .join('\n')
    return `${arenaBaseDockerfile}\n# --- PROBLEM-SPECIFIC INSTRUCTIONS ---\n${problemInstructions}`
  }

  private async copyArenaWarIfConfigured(
    effectiveDockerContext: string,
  ): Promise<string | null> {
    const configuredWarPath = this.getConfiguredValue(
      ['ARENA_SYNTHETICA_WAR_PATH'],
      'arena.manager.synthetica.war.path',
    )?.trim()
    if (!configuredWarPath) {
      this.logger.debug(
        'No ARENA_SYNTHETICA_WAR_PATH configured; skipping synthetica2.war copy.',
      )
      return null
    }

    const destination = join(effectiveDockerContext, 'synthetica2.war')
    await fs.copyFile(configuredWarPath, destination)
    this.logger.log({
      action: 'copyArenaWarIfConfigured.success',
      configuredWarPath,
      destination,
    })
    return destination
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ output: string; exitCode: number }> {
    this.logger.verbose({ action: 'runCommand.start', args, command, cwd })
    try {
      const { stderr, stdout } = await execFileAsync(command, args, { cwd })
      const result = {
        exitCode: 0,
        output: `${stdout ?? ''}${stderr ?? ''}`,
      }
      this.logger.verbose({
        action: 'runCommand.finish',
        command,
        exitCode: result.exitCode,
      })
      return result
    } catch (error) {
      const failure = error as {
        code?: number
        message?: string
        stderr?: string
        stdout?: string
      }
      const result = {
        exitCode: failure.code ?? 1,
        output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`,
      }
      this.logger.warn({
        action: 'runCommand.failure',
        command,
        exitCode: result.exitCode,
        outputPreview: result.output.slice(0, 500),
      })
      return result
    }
  }

  private async validateZipEntries(
    zipPath: string,
    destination: string,
  ): Promise<void> {
    this.logger.verbose({
      action: 'validateZipEntries.start',
      destination,
      zipPath,
    })
    const entries =
      process.platform === 'win32'
        ? await this.listZipEntriesWindows(zipPath)
        : await this.listZipEntriesUnix(zipPath)

    for (const entry of entries) {
      const normalizedEntry = entry.replace(/\\/g, '/')
      if (
        normalizedEntry.startsWith('/') ||
        normalizedEntry.startsWith('../') ||
        normalizedEntry.includes('/../') ||
        normalizedEntry.includes(':/')
      ) {
        throw new Error(
          `ZIP entry contains an illegal path traversal: ${entry}`,
        )
      }

      const resolvedPath = resolve(destination, normalizedEntry)
      const destinationRoot = resolve(destination)
      if (!resolvedPath.startsWith(destinationRoot)) {
        throw new Error(
          `ZIP entry contains an illegal path traversal: ${entry}`,
        )
      }
    }
    this.logger.log({
      action: 'validateZipEntries.finish',
      entryCount: entries.length,
      zipPath,
    })
  }

  private async listZipEntriesUnix(zipPath: string): Promise<string[]> {
    const result = await this.runCommand('unzip', ['-Z1', zipPath], tmpdir())
    if (result.exitCode !== 0) {
      throw new Error(result.output || `Failed to inspect ${zipPath}`)
    }

    return result.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  private async listZipEntriesWindows(zipPath: string): Promise<string[]> {
    const escapedZipPath = zipPath.replace(/'/g, "''")
    const script = [
      "Add-Type -AssemblyName 'System.IO.Compression.FileSystem'",
      `$zip = [System.IO.Compression.ZipFile]::OpenRead('${escapedZipPath}')`,
      'try { $zip.Entries | ForEach-Object { $_.FullName } } finally { $zip.Dispose() }',
    ].join('; ')

    const result = await this.runCommand(
      'powershell',
      ['-NoProfile', '-Command', script],
      tmpdir(),
    )
    if (result.exitCode !== 0) {
      throw new Error(result.output || `Failed to inspect ${zipPath}`)
    }

    return result.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  private getConfiguredValue(
    envKeys: string[],
    propertyKey: string,
  ): string | undefined {
    for (const key of envKeys) {
      const value = process.env[key]?.trim()
      if (value) {
        return value
      }
    }

    const properties = this.loadPropertiesFile()
    const propertyValue = properties.get(propertyKey)?.trim()
    return propertyValue || undefined
  }

  private propertiesCache?: Map<string, string>

  private loadPropertiesFile(): Map<string, string> {
    if (this.propertiesCache) {
      return this.propertiesCache
    }

    const candidates = [
      resolve(process.cwd(), 'arena-manager.properties'),
      resolve(
        process.cwd(),
        'src',
        'main',
        'resources',
        'arena-manager.properties',
      ),
    ]

    for (const candidate of candidates) {
      try {
        const content = readFileSync(candidate, 'utf8')
        const map = new Map<string, string>()
        content.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) {
            return
          }
          const separatorIndex = trimmed.indexOf('=')
          if (separatorIndex === -1) {
            return
          }
          const key = trimmed.slice(0, separatorIndex).trim()
          const value = trimmed.slice(separatorIndex + 1).trim()
          map.set(key, value)
        })
        this.propertiesCache = map
        return map
      } catch {
        // Try the next candidate.
      }
    }

    this.propertiesCache = new Map<string, string>()
    return this.propertiesCache
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
