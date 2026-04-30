import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { Response } from 'express';

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)\s+instructions?/i,
  /system\s*prompt/i,
  /jailbreak/i,
  /forget\s+your\s+instructions?/i,
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly model = process.env.OLLAMA_MODEL ?? 'llama3';

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
  ) {}

  async createSession(tenantId: string, userId: string) {
    const s = await this.prisma.chatSession.create({
      data: { tenantId, userId, title: 'Nova conversa' },
    });
    return { sessionId: s.id };
  }

  listSessions(tenantId: string, userId: string) {
    return this.prisma.chatSession.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  async getSession(tenantId: string, userId: string, sessionId: string) {
    const s = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } },
    });
    if (!s) throw new NotFoundException('Sessão não encontrada.');
    return s;
  }

  private sanitize(msg: string): string {
    if (!msg?.trim()) throw new ForbiddenException('Mensagem vazia.');
    for (const p of INJECTION_PATTERNS) {
      if (p.test(msg)) throw new ForbiddenException('Mensagem não permitida.');
    }
    return msg.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().substring(0, 2000);
  }

  async streamChat(
    tenantId: string,
    userId: string,
    sessionId: string,
    message: string,
    res: Response,
  ) {
    const userMsg = this.sanitize(message);

    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId, userId },
    });
    if (!session) throw new ForbiddenException('Sessão inválida.');

    // Salva mensagem do usuário
    await this.prisma.chatMessage.create({
      data: { sessionId, role: 'USER', content: userMsg },
    });

    // Busca contexto financeiro
    const context = await this.rag.getFinancialContext(tenantId);

    // Histórico da sessão
    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });
    history.reverse();

    const systemPrompt = `Você é um assistente financeiro pessoal integrado ao FinControl.
Responda sempre em português do Brasil de forma clara e objetiva.
Use APENAS os dados do contexto abaixo. Não invente valores.
Ao mencionar valores use o formato: R$ 1.234,56

CONTEXTO FINANCEIRO DO USUÁRIO:
${context}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(0, -1).map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMsg },
    ];

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          options: { temperature: 0.65, num_ctx: 4096 },
        }),
      });

      if (!response.ok || !response.body) {
        res.write(`data: ${JSON.stringify({ error: 'Ollama indisponível' })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              fullResponse += chunk.message.content;
              res.write(`data: ${JSON.stringify({ token: chunk.message.content })}\n\n`);
            }
            if (chunk.done) break;
          } catch {}
        }
      }
    } catch (err) {
      this.logger.error('Ollama stream error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Erro ao conectar com o modelo de IA' })}\n\n`);
    }

    // Salva resposta
    await this.prisma.chatMessage.create({
      data: { sessionId, role: 'ASSISTANT', content: fullResponse || 'Sem resposta.' },
    });

    // Atualiza título se for primeira mensagem
    if (session.title === 'Nova conversa') {
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: userMsg.substring(0, 50), updatedAt: new Date() },
      });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }
}