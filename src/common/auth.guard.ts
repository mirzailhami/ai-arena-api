import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'

@Injectable()
export class ArenaAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
    }>()

    const authorization = request.headers.authorization
    const sessionId = request.headers.sessionid

    if (authorization || sessionId) {
      // TODO: Restrict to specific roles if platform requirements expand beyond logged-in access.
      return true
    }

    throw new UnauthorizedException('Authentication is required.')
  }
}
