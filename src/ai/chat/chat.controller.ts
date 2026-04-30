import {
  Controller, Post, Get, Body, Param,
  Req, Res, UseGuards, Query,
} from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('ai/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  @Post('sessions')
  createSession(@Req() req: any) {
    return this.svc.createSession(req.tenantId, req.user.sub);
  }

  @Get('sessions')
  listSessions(@Req() req: any) {
    return this.svc.listSessions(req.tenantId, req.user.sub);
  }

  @Get('sessions/:id')
  getSession(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSession(req.tenantId, req.user.sub, id);
  }

  @Post('sessions/:id/message')
  async sendMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') sessionId: string,
    @Body('message') message: string,
  ) {
    await this.svc.streamChat(req.tenantId, req.user.sub, sessionId, message, res);
  }
}