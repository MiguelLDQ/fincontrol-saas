import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  name: string;
  type: AccountType;
  balance?: number;
  currency?: string;
  pixKey?: string;
  pixKeyType?: string;
  bankCode?: string;
  color?: string;
  icon?: string;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async findAll(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return accounts.map(a => ({
      ...a,
      balance: this.encryption.decryptAmount(a.encryptedBalance),
      encryptedBalance: undefined,
      pixKey: a.pixKey ? this.encryption.decrypt(a.pixKey) : undefined,
    }));
  }

  async create(tenantId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        encryptedBalance: this.encryption.encryptAmount(dto.balance ?? 0),
        currency: dto.currency ?? 'BRL',
        pixKey: dto.pixKey ? this.encryption.encrypt(dto.pixKey) : undefined,
        pixKeyType: dto.pixKeyType,
        bankCode: dto.bankCode,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const acc = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (!acc) throw new NotFoundException('Conta não encontrada.');
    await this.prisma.account.update({ where: { id }, data: { isActive: false } });
    return { message: 'Conta desativada.' };
  }
}
