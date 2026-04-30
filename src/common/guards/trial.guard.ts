import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrialGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.tenantId;
    if (!tenantId) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true, plan: true, planExpiresAt: true, name: true },
    });

    if (!tenant) throw new ForbiddenException('Tenant não encontrado.');

    // Conta suspensa (inadimplência após vencimento + carência)
    if (!tenant.isActive) {
      throw new ForbiddenException(
        JSON.stringify({
          code: 'ACCOUNT_SUSPENDED',
          message: 'Sua conta está suspensa. Regularize o pagamento para continuar.',
          action: 'SHOW_PAYMENT',
        }),
      );
    }

    // Trial ou plano expirado
    if (tenant.planExpiresAt && tenant.planExpiresAt < new Date()) {
      const daysAgo = Math.ceil(
        (Date.now() - tenant.planExpiresAt.getTime()) / 86400_000,
      );
      throw new ForbiddenException(
        JSON.stringify({
          code: 'TRIAL_EXPIRED',
          message: `Seu período de ${tenant.plan === 'FREE' ? 'trial de 15 dias' : 'plano'} expirou há ${daysAgo} dia(s).`,
          expiredAt: tenant.planExpiresAt,
          action: 'SHOW_PAYMENT',
        }),
      );
    }

    return true;
  }
}