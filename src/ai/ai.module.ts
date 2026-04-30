import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { RagService } from './rag/rag.service';
import { ChatService } from './chat/chat.service';
import { ChatController } from './chat/chat.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [RagService, ChatService],
  controllers: [ChatController],
})
export class AiModule {}