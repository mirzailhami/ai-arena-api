import express, { RequestHandler } from 'express'
import { LogLevel, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NextFunction, Request, Response } from 'express'

import { AppModule } from './app.module'
import { LoggerService } from './shared/modules/global/logger.service'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: resolveNestLogLevels(process.env.LOG_LEVEL),
  })
  const apiPrefix = (process.env.API_PREFIX || 'v6').replace(/^\/+|\/+$/g, '')
  const logger = LoggerService.forRoot('Bootstrap')

  const rawUploadMiddleware: RequestHandler = express.raw({
    limit: '100mb',
    type: 'application/octet-stream',
  })

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now()
    const requestLogger = LoggerService.forRoot('HttpRequest')

    requestLogger.log({
      ip: req.ip,
      method: req.method,
      type: 'request',
      url: req.originalUrl,
      userAgent: req.headers['user-agent'],
    })

    res.on('finish', () => {
      requestLogger.log({
        method: req.method,
        responseTime: `${Date.now() - startedAt}ms`,
        statusCode: res.statusCode,
        type: 'response',
        url: req.originalUrl,
      })
    })

    next()
  })

  app.setGlobalPrefix(apiPrefix)
  app.use(`/${apiPrefix}/problem/upload`, rawUploadMiddleware)
  app.enableCors()
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: false,
      transform: true,
      whitelist: true,
    }),
  )

  const port = Number(process.env.PORT || 3008)
  await app.listen(port)
  logger.log(`ai-arena-api listening on http://localhost:${port}/${apiPrefix}`)
}

void bootstrap()

function resolveNestLogLevels(rawLevel: string | undefined): LogLevel[] {
  const normalizedLevel = (rawLevel || 'info').toLowerCase().trim()
  const effectiveLevel = normalizedLevel === 'info' ? 'log' : normalizedLevel

  const orderedLevels: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose']
  const targetIndex = orderedLevels.indexOf(effectiveLevel as LogLevel)

  if (targetIndex === -1) {
    return ['error', 'warn', 'log']
  }

  return orderedLevels.slice(0, targetIndex + 1)
}
