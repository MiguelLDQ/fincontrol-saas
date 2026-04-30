import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── REGISTER ────────────────────────────────────────────────

  async register(dto: {
    name: string;
    email: string;
    password: string;
    tenantName: string;
  }) {
    if (!dto.name || !dto.email || !dto.password || !dto.tenantName) {
      throw new ForbiddenException('Todos os campos são obrigatórios.');
    }

    if (dto.password.length < 8) {
      throw new ForbiddenException('A senha deve ter pelo menos 8 caracteres.');
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ForbiddenException('Este email já está cadastrado.');
    }

    // Slug único do tenant
    const baseSlug = dto.tenantName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);

    let slug = baseSlug || 'tenant';
    let attempts = 0;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempts}`;
    }

    // Trial 15 dias
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 15);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug,
          plan: 'FREE',
          planExpiresAt: trialEnd,
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash: await this.encryption.hashPassword(dto.password),
          name: dto.name,
          role: 'OWNER',
        },
      });

      // Categorias padrão
      await tx.category.createMany({
        data: [
          { tenantId: tenant.id, name: 'Salário', type: 'INCOME', color: '#00E5A0', icon: '💼' },
          { tenantId: tenant.id, name: 'Freelance', type: 'INCOME', color: '#0095FF', icon: '💻' },
          { tenantId: tenant.id, name: 'Rendimentos', type: 'INCOME', color: '#7C3AED', icon: '📊' },
          { tenantId: tenant.id, name: 'Moradia', type: 'EXPENSE', color: '#FF4D6A', icon: '🏠' },
          { tenantId: tenant.id, name: 'Alimentação', type: 'EXPENSE', color: '#F59E0B', icon: '🛒' },
          { tenantId: tenant.id, name: 'Delivery', type: 'EXPENSE', color: '#EF4444', icon: '🍕' },
          { tenantId: tenant.id, name: 'Transporte', type: 'EXPENSE', color: '#3B82F6', icon: '🚗' },
          { tenantId: tenant.id, name: 'Saúde', type: 'EXPENSE', color: '#10B981', icon: '💊' },
          { tenantId: tenant.id, name: 'Streaming', type: 'EXPENSE', color: '#8B5CF6', icon: '📺' },
          { tenantId: tenant.id, name: 'Utilidades', type: 'EXPENSE', color: '#78716C', icon: '⚡' },
          { tenantId: tenant.id, name: 'Investimentos', type: 'EXPENSE', color: '#F97316', icon: '💎' },
          { tenantId: tenant.id, name: 'Transferência', type: 'TRANSFER', color: '#64748B', icon: '↔️' },
        ],
      });

      // Conta padrão
      await tx.account.create({
        data: {
          tenantId: tenant.id,
          name: 'Conta Principal',
          type: 'CHECKING',
          encryptedBalance: this.encryption.encryptAmount(0),
          currency: 'BRL',
          color: '#00E5A0',
          icon: '🏦',
        },
      });

      return { tenant, user };
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'TENANT_REGISTERED',
        metadata: { plan: 'FREE', trialEnd: trialEnd.toISOString(), slug },
      },
    });

    this.logger.log(`[Auth] Novo tenant registrado: ${slug} (trial até ${trialEnd.toLocaleDateString('pt-BR')})`);

    return this.issueTokens(user.id, tenant.id, user.role);
  }

  // ─── LOGIN ────────────────────────────────────────────────────

  async login(
    tenantSlug: string,
    email: string,
    password: string,
    totpCode?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new UnauthorizedException('Credenciais inválidas.');

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });

    const dummy = '$argon2id$v=19$m=65536,t=3,p=4$AAAA$BBBB';
    if (!user) {
      await this.encryption.verifyPassword(dummy, password);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Conta bloqueada por excesso de tentativas.');
    }

    const valid = await this.encryption.verifyPassword(user.passwordHash, password);
    if (!valid) {
      const count = user.failedLoginCount + 1;
      const locked = count >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: count, lockedUntil: locked },
      });
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) throw new UnauthorizedException('Código 2FA obrigatório.');
      const secret = this.encryption.decryptTotpSecret(user.totpSecret);
      if (!authenticator.verify({ token: totpCode, secret })) {
        throw new UnauthorizedException('Código 2FA inválido.');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.issueTokens(user.id, tenant.id, user.role);
  }

  // ─── TOKEN MANAGEMENT ─────────────────────────────────────────

  private async issueTokens(userId: string, tenantId: string, role: string) {
    const payload = { sub: userId, tenantId, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);
    const hash = await this.encryption.hashPassword(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, refreshTokenHash: true },
    });
    if (!user?.refreshTokenHash) throw new UnauthorizedException('Sessão encerrada.');
    const ok = await this.encryption.verifyPassword(user.refreshTokenHash, refreshToken);
    if (!ok) {
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Token inválido. Sessão encerrada.');
    }
    return this.issueTokens(user.id, payload.tenantId, user.role);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async me(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true, name: true, email: true,
        role: true, totpEnabled: true, lastLoginAt: true,
      },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, slug: true,
        plan: true, planExpiresAt: true, isActive: true,
      },
    });

    if (!tenant) return user;

    const now = new Date();
    const expired = tenant.planExpiresAt ? tenant.planExpiresAt < now : false;
    const daysLeft = tenant.planExpiresAt
      ? Math.max(0, Math.ceil((tenant.planExpiresAt.getTime() - now.getTime()) / 86400_000))
      : null;

    return {
      ...user,
      tenant: {
        ...tenant,
        expired,
        daysLeft,
        status: !tenant.isActive
          ? 'SUSPENDED'
          : expired
          ? 'EXPIRED'
          : daysLeft !== null && daysLeft <= 3
          ? 'EXPIRING_SOON'
          : 'ACTIVE',
      },
    };
  }
}