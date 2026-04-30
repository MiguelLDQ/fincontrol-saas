import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todo dia à meia-noite:
   * Suspende contas cujo plano expirou há mais de 3 dias (carência).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async suspendExpiredAccounts() {
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() - 3);

    const { count } = await this.prisma.tenant.updateMany({
      where: {
        isActive: true,
        planExpiresAt: { lt: gracePeriodEnd },
      },
      data: { isActive: false },
    });

    if (count > 0) {
      this.logger.warn(`[Billing] ${count} conta(s) suspensa(s) por inadimplência.`);
    }
  }

  /**
   * A cada hora:
   * Loga (e futuramente dispara email) para tenants com trial/plano
   * expirando em até 3 dias.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async notifyExpiringSoon() {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);

    const expiring = await this.prisma.tenant.findMany({
      where: {
        isActive: true,
        planExpiresAt: { lte: in3Days, gt: new Date() },
      },
      select: { id: true, name: true, slug: true, plan: true, planExpiresAt: true },
    });

    for (const t of expiring) {
      const daysLeft = Math.ceil(
        (t.planExpiresAt!.getTime() - Date.now()) / 86400_000,
      );
      this.logger.log(
        `[Trial] Tenant "${t.name}" (${t.slug}) — plano ${t.plan} expira em ${daysLeft} dia(s).`,
      );
      // TODO: disparar email de alerta aqui usando Nodemailer ou similar
    }
  }
}