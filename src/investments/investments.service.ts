import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getPortfolio(tenantId: string) {
    const investments = await this.prisma.investment.findMany({
      where: { tenantId },
      include: { priceHistory: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
    });

    return investments.map(inv => {
      const latest = inv.priceHistory[0];
      const currentPrice = latest ? Number(latest.price) : 0;
      const avgPrice = Number(inv.avgPrice);
      const qty = Number(inv.quantity);
      const invested = avgPrice * qty;
      const current = currentPrice * qty;
      const pnl = current - invested;
      return {
        id: inv.id,
        symbol: inv.symbol,
        name: inv.name,
        type: inv.type,
        quantity: qty,
        avgPrice,
        currentPrice,
        currency: inv.currency,
        exchange: inv.exchange,
        invested: Math.round(invested * 100) / 100,
        currentValue: Math.round(current * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPct: invested > 0 ? Math.round((pnl / invested) * 10000) / 100 : 0,
        change24h: latest ? Number(latest.change24h) : null,
        lastUpdatedAt: latest?.fetchedAt ?? null,
      };
    });
  }

  async getSummary(tenantId: string) {
    const portfolio = await this.getPortfolio(tenantId);
    const totalInvested = portfolio.reduce((s, i) => s + i.invested, 0);
    const totalCurrent  = portfolio.reduce((s, i) => s + i.currentValue, 0);
    return {
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalCurrent: Math.round(totalCurrent * 100) / 100,
      totalPnl: Math.round((totalCurrent - totalInvested) * 100) / 100,
      totalPnlPct: totalInvested > 0 ? Math.round(((totalCurrent - totalInvested) / totalInvested) * 10000) / 100 : 0,
      count: portfolio.length,
    };
  }

  create(tenantId: string, dto: any) {
    return this.prisma.investment.create({
      data: { tenantId, ...dto },
    });
  }

  async addPrice(tenantId: string, investmentId: string, price: number, source = 'manual') {
    const inv = await this.prisma.investment.findFirst({ where: { id: investmentId, tenantId } });
    if (!inv) throw new Error('Investimento não encontrado.');
    return this.prisma.investmentPrice.create({
      data: { investmentId, price, source },
    });
  }

  remove(tenantId: string, id: string) {
    return this.prisma.investment.deleteMany({ where: { id, tenantId } });
  }
}