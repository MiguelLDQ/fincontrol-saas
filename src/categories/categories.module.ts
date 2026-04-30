import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [CategoriesService],
  controllers: [CategoriesController],
})
export class CategoriesModule {}