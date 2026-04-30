import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { TransactionType, TransactionStatus } from '@prisma/client';

export class CreateTransactionDto {
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  description: string;
  amount: number;
  type: TransactionType;
  status?: TransactionStatus;
  date: string;
  dueDate?: string;
  tags?: string[];
  notes?: string;
  isRecurring?: boolean;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async findAll(tenantId: string, filters?: {
    type?: string; accountId?: string;
    from?: string; to?: string; search?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.type) where.type = filters.type;
    if (filters?.accountId) where.accountId = filters.accountId;
    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to)   where.date.lte = new Date(filters.to);
    }
    if (filters?.search) {
      where.description = { contains: filters.search, mode: 'insensitive' };
    }

    const txs = await this.prisma.transaction.findMany({
      where,
      include: { category: true, account: true, toAccount: true },
      orderBy: { date: 'desc' },
      take: 100,
    });

    return txs.map(tx => ({
      ...tx,
      amount: this.encryption.decryptAmount(tx.encryptedAmount),
      encryptedAmount: undefined,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, tenantId },
      include: { category: true, account: true, toAccount: true, document: true },
    });
    if (!tx) throw new NotFoundException('Transação não encontrada.');
    return { ...tx, amount: this.encryption.decryptAmount(tx.encryptedAmount), encryptedAmount: undefined };
  }

  async create(tenantId: string, dto: CreateTransactionDto) {
    await this.guardAccount(tenantId, dto.accountId);

    const tx = await this.prisma.transaction.create({
      data: {
        tenantId,
        accountId: dto.accountId,
        toAccountId: dto.toAccountId,
        categoryId: dto.categoryId,
        description: dto.description,
        encryptedAmount: this.encryption.encryptAmount(Math.abs(dto.amount)),
        type: dto.type,
        status: dto.status ?? 'COMPLETED',
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        tags: dto.tags ?? [],
        notes: dto.notes,
        isRecurring: dto.isRecurring ?? false,
      },
    });

    return { ...tx, amount: dto.amount, encryptedAmount: undefined };
  }

  async update(tenantId: string, id: string, dto: Partial<CreateTransactionDto>) {
    await this.findOne(tenantId, id);
    const data: any = { ...dto };
    if (dto.amount !== undefined) {
      data.encryptedAmount = this.encryption.encryptAmount(Math.abs(dto.amount));
      delete data.amount;
    }
    if (dto.date) data.date = new Date(dto.date);
    return this.prisma.transaction.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.transaction.delete({ where: { id } });
    return { message: 'Transação removida.' };
  }

  async summary(tenantId: string, month?: string) {
    const now = month ? new Date(month + '-01') : new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const txs = await this.prisma.transaction.findMany({
      where: { tenantId, date: { gte: from, lte: to }, status: 'COMPLETED' },
    });

    let income = 0, expense = 0;
    for (const tx of txs) {
      const amt = this.encryption.decryptAmount(tx.encryptedAmount);
      if (tx.type === 'INCOME' || tx.type === 'PIX_IN') income += amt;
      else if (tx.type === 'EXPENSE' || tx.type === 'PIX_OUT') expense += amt;
    }

    return {
      month: from.toISOString().substring(0, 7),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      balance: Math.round((income - expense) * 100) / 100,
      count: txs.length,
    };
  }

  private async guardAccount(tenantId: string, accountId: string) {
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, tenantId } });
    if (!acc) throw new ForbiddenException('Conta não pertence a este tenant.');
  }
}
