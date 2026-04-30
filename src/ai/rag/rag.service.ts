import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  constructor(private readonly prisma: PrismaService) {}

  async getFinancialContext(tenantId: string): Promise<string> {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [accounts, txsThisMonth, txsLastMonth, categories, investments] = await Promise.all([
      this.prisma.account.findMany({
        where: { tenantId, isActive: true },
        select: { name: true, type: true },
      }),
      this.prisma.transaction.findMany({
        where: { tenantId, date: { gte: startMonth }, status: 'COMPLETED' },
        include: { category: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      this.prisma.transaction.findMany({
        where: { tenantId, date: { gte: startLastMonth, lte: endLastMonth }, status: 'COMPLETED' },
        include: { category: { select: { name: true } } },
        take: 50,
      }),
      this.prisma.category.findMany({ where: { tenantId }, select: { name: true, type: true } }),
      this.prisma.investment.findMany({
        where: { tenantId },
        include: { priceHistory: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
      }),
    ]);

    const monthName = startMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const lastMonthName = startLastMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const txSummary = (txs: any[]) => {
      const byType: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      txs.forEach(tx => {
        byType[tx.type] = (byType[tx.type] ?? 0) + 1;
        const cat = tx.category?.name ?? 'Sem categoria';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      });
      return { byType, byCategory, total: txs.length, descriptions: txs.slice(0, 10).map(t => t.description).join(', ') };
    };

    const thisSum = txSummary(txsThisMonth);
    const lastSum = txSummary(txsLastMonth);

    const invSummary = investments.map(i => {
      const price = i.priceHistory[0] ? Number(i.priceHistory[0].price) : Number(i.avgPrice);
      return `${i.symbol} (${i.type}): ${Number(i.quantity)} unidades, preço atual R$ ${price.toFixed(2)}`;
    }).join('\n');

    return `
CONTAS ATIVAS: ${accounts.map(a => `${a.name} (${a.type})`).join(', ')}

MÊS ATUAL (${monthName}): ${thisSum.total} transações
Tipos: ${JSON.stringify(thisSum.byType)}
Categorias: ${JSON.stringify(thisSum.byCategory)}
Descrições recentes: ${thisSum.descriptions}

MÊS ANTERIOR (${lastMonthName}): ${lastSum.total} transações
Tipos: ${JSON.stringify(lastSum.byType)}
Categorias: ${JSON.stringify(lastSum.byCategory)}

CARTEIRA DE INVESTIMENTOS:
${invSummary || 'Nenhum investimento cadastrado'}

CATEGORIAS DISPONÍVEIS: ${categories.map(c => c.name).join(', ')}
    `.trim();
  }
}