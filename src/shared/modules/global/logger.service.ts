import {
  Injectable,
  LoggerService as NestLoggerService,
  LogLevel,
} from '@nestjs/common'

@Injectable()
export class LoggerService implements NestLoggerService {
  private context?: string
  private readonly activeLogLevel: LogLevel

  constructor(context?: string) {
    this.context = context
    this.activeLogLevel = this.resolveActiveLogLevel()
  }

  static forRoot(context: string): LoggerService {
    return new LoggerService(context)
  }

  setContext(context: string): void {
    this.context = context
  }

  log(message: unknown, context?: string): void {
    this.printMessage('log', message, context || this.context)
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.printMessage('error', message, context || this.context)
    if (trace) {
      console.error(trace)
    }
  }

  warn(message: unknown, context?: string): void {
    this.printMessage('warn', message, context || this.context)
  }

  debug(message: unknown, context?: string): void {
    this.printMessage('debug', message, context || this.context)
  }

  verbose(message: unknown, context?: string): void {
    this.printMessage('verbose', message, context || this.context)
  }

  fatal(message: unknown, context?: string): void {
    this.printMessage('fatal', message, context || this.context)
  }

  private printMessage(
    level: LogLevel,
    message: unknown,
    context?: string,
  ): void {
    if (!this.shouldLog(level)) {
      return
    }

    const timestamp = new Date().toISOString()
    const logMessage = this.serializeMessage(message)
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${context ? `[${context}] ` : ''}${logMessage}`

    switch (level) {
      case 'error':
      case 'fatal':
        console.error(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'debug':
        console.debug(formatted)
        break
      case 'verbose':
        console.log(formatted)
        break
      default:
        console.log(formatted)
    }
  }

  private serializeMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message
    }

    try {
      return JSON.stringify(message)
    } catch {
      return String(message)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const priorities: Record<LogLevel, number> = {
      debug: 3,
      error: 0,
      fatal: 0,
      log: 2,
      verbose: 4,
      warn: 1,
    }

    return priorities[level] <= priorities[this.activeLogLevel]
  }

  private resolveActiveLogLevel(): LogLevel {
    const configured = (process.env.LOG_LEVEL || 'info').toLowerCase().trim()

    const normalized = configured === 'info' ? 'log' : configured
    const validLevels: LogLevel[] = [
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
      'fatal',
    ]

    return validLevels.includes(normalized as LogLevel)
      ? (normalized as LogLevel)
      : 'log'
  }
}
