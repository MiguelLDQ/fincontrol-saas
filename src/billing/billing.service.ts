import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHmac, randomBytes } from 'crypto';

function crc16(str: string): string {
  let crc = 0xffff;
  for (const c of str) {
    crc ^= c.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function pad(id: string, val: string): string {
  const v = val.substring(0, 99);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

function buildPixPayload(pixKey: string, merchant: string, city: string, amount: number, txid: string, description: string): string {
  const mai = pad('00', 'BR.GOV.BCB.PIX') + pad('01', pixKey) + (description ? pad('02', description.substring(0, 72)) : '');
  const payload = [
    pad('00', '01'), pad('01', '12'), pad('26', mai),
    pad('52', '0000'), pad('53', '986'),
    pad('54', amount.toFixed(2)), pad('58', 'BR'),
    pad('59', merchant.substring(0, 25)), pad('60', city.substring(0, 15)),
    pad('62', pad('05', txid.substring(0, 25))), '6304',
  ].join('');
  return payload + crc16(payload + '6304');
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly pixKey = process.env.COMPANY_PIX_KEY ?? 'contato@fincontrol.app';
  private readonly merchant = process.env.COMPANY_NAME ?? 'FinControl';
  private readonly city = process.env.COMPANY_CITY ?? 'Curitiba';
  private readonly LIFETIME_PRICE = 30.00;

  constructor(private readonly prisma: PrismaService) {}

  async getTenantStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, plan: true, planExpiresAt: true, isActive: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const now = new Date();
    const isLifetime = tenant.plan === 'PRO' && tenant.planExpiresAt
      ? tenant.planExpiresAt.getFullYear() > now.getFullYear() + 50
      : false;

    const isTrial = tenant.plan === 'FREE';
    const expired = !isLifetime && tenant.planExpiresAt ? tenant.planExpiresAt < now : false;
    const daysLeft = isLifetime ? null : tenant.planExpiresAt
      ? Math.max(0, Math.ceil((tenant.planExpiresAt.getTime() - now.getTime()) / 86400_000))
      : null;

    const status = !tenant.isActive ? 'SUSPENDED'
      : isLifetime ? 'LIFETIME'
      : expired ? 'EXPIRED'
      : isTrial && daysLeft !== null && daysLeft <= 3 ? 'EXPIRING_SOON'
      : isTrial ? 'TRIAL'
      : 'ACTIVE';

    return {
      plan: tenant.plan,
      isActive: tenant.isActive,
      isLifetime,
      isTrial,
      planExpiresAt: tenant.planExpiresAt,
      expired,
      daysLeft,
      status,
      price: 'R$ 30,00',
      description: 'Pagamento único — acesso vitalício completo',
    };
  }

  async generatePixCharge(tenantId: string) {
    const txid = `FIN${randomBytes(8).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const pixPayload = buildPixPayload(
      this.pixKey, this.merchant, this.city,
      this.LIFETIME_PRICE, txid, 'FinControl Acesso Vitalicio',
    );

    const event = await this.prisma.billingEvent.create({
      data: {
        tenantId,
        type: 'MANUAL_PIX',
        plan: 'PRO' as any,
        amount: this.LIFETIME_PRICE,
        currency: 'BRL',
        status: 'PENDING',
        pixPayload,
        pixTxid: txid,
        expiresAt,
      },
    });

    this.logger.log(`[Billing] Pix gerado: tenant=${tenantId} txid=${txid}`);

    return {
      billingEventId: event.id,
      pixPayload,
      pixCopiaCola: pixPayload,
      txid,
      amount: this.LIFETIME_PRICE,
      amountFormatted: 'R$ 30,00',
      description: 'Acesso vitalício ao FinControl',
      expiresAt,
      instructions: 'Copie o código Pix abaixo e cole no app do seu banco.',
    };
  }

  async confirmPayment(billingEventId: string) {
    const event = await this.prisma.billingEvent.findUnique({ where: { id: billingEventId } });
    if (!event) throw new NotFoundException('Evento de billing não encontrado.');
    if (event.status !== 'PENDING') return { message: 'Pagamento já processado.', status: event.status };
    if (event.expiresAt && event.expiresAt < new Date()) {
      await this.prisma.billingEvent.update({ where: { id: billingEventId }, data: { status: 'EXPIRED' } });
      return { message: 'QR Code expirado. Gere um novo.' };
    }

    // Acesso vitalício = expira em 100 anos
    const forever = new Date();
    forever.setFullYear(forever.getFullYear() + 100);

    await this.prisma.$transaction([
      this.prisma.billingEvent.update({
        where: { id: billingEventId },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      this.prisma.tenant.update({
        where: { id: event.tenantId },
        data: { plan: 'PRO' as any, planExpiresAt: forever, isActive: true },
      }),
    ]);

    this.logger.log(`[Billing] Acesso vitalício ativado: tenant=${event.tenantId}`);
    return { message: 'Pagamento confirmado! Acesso vitalício ativado. Bem-vindo ao FinControl!' };
  }

  getBillingHistory(tenantId: string) {
    return this.prisma.billingEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, plan: true, amount: true, status: true, pixTxid: true, paidAt: true, expiresAt: true, createdAt: true },
    });
  }

  async handleWebhook(gatewaySlug: string, payload: Buffer, signature: string) {
    const secret = process.env[`${gatewaySlug.toUpperCase()}_WEBHOOK_SECRET`];
    if (!secret) return { received: true };
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expected) return { received: false };
    let data: any;
    try { data = JSON.parse(payload.toString()); } catch { return { received: false }; }
    if (data?.action === 'payment.updated' && data?.data?.status === 'approved') {
      const event = await this.prisma.billingEvent.findFirst({ where: { gatewayRef: String(data.data.id), status: 'PENDING' } });
      if (event) await this.confirmPayment(event.id);
    }
    return { received: true };
  }

  async suspendExpired() {
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() - 3);
    const { count } = await this.prisma.tenant.updateMany({
      where: { isActive: true, planExpiresAt: { lt: gracePeriodEnd }, plan: 'FREE' as any },
      data: { isActive: false },
    });
    return count;
  }
}