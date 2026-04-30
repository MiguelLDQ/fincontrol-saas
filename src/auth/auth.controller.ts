import {
  Controller, Post, Get, Body, Req, Res,
  HttpCode, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: { name: string; email: string; password: string; tenantName: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(body);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 15*60*1000, path: '/' });
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 7*24*60*60*1000, path: '/api/v1/auth/refresh' });
    return { message: 'Conta criada com sucesso! Seu trial de 15 dias foi ativado.', trial: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { tenantSlug: string; email: string; password: string; totpCode?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(body.tenantSlug, body.email, body.password, body.totpCode);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 15*60*1000, path: '/' });
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 7*24*60*60*1000, path: '/api/v1/auth/refresh' });
    return { message: 'Login realizado com sucesso.' };
  }

  @Post('login-by-email')
  @HttpCode(200)
  async loginByEmail(
    @Body() body: { email: string; password: string; totpCode?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { email: body.email },
      include: { tenant: { select: { slug: true, isActive: true } } },
    });
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const tokens = await this.authService.login(user.tenant.slug, body.email, body.password, body.totpCode);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 15*60*1000, path: '/' });
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 7*24*60*60*1000, path: '/api/v1/auth/refresh' });
    return { message: 'Login realizado com sucesso.' };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'];
    if (!token) throw new UnauthorizedException('Refresh token não encontrado.');
    const tokens = await this.authService.refreshTokens(token);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 15*60*1000, path: '/' });
    return { message: 'Token renovado.' };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['access_token'];
    if (token) {
      try {
        const payload: any = await this.jwt.verifyAsync(token, { secret: this.config.get('JWT_SECRET') });
        await this.authService.logout(payload.sub);
      } catch {}
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Logout realizado.' };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.['access_token'];
    if (!token) throw new UnauthorizedException('Não autenticado.');
    const payload: any = await this.jwt
      .verifyAsync(token, { secret: this.config.get('JWT_SECRET') })
      .catch(() => { throw new UnauthorizedException('Token inválido.'); });
    return this.authService.me(payload.sub, payload.tenantId);
  }
}