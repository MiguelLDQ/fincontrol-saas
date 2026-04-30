import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Try cookie first, then Authorization header
    let token = req.cookies?.['access_token'];
    if (!token) {
      const auth = req.headers?.authorization;
      if (auth?.startsWith('Bearer ')) token = auth.slice(7);
    }

    if (!token) throw new UnauthorizedException('Token não encontrado.');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      req.user = payload;
      req.tenantId = payload.tenantId;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }
}
