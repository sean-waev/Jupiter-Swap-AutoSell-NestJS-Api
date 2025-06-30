import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JupiterService } from './jupiter.service';
import { JupiterAutoSellService } from './jupiter-auto-sell/jupiter-auto-sell.service';
import { JupiterAutoSellController } from './jupiter-auto-sell/jupiter-auto-sell.controller';
import { RequestQueueService } from './request-queue.service';

@Module({
  imports: [ConfigModule],
  providers: [JupiterService, JupiterAutoSellService, RequestQueueService],
  controllers: [JupiterAutoSellController],
  exports: [JupiterService, JupiterAutoSellService],
})
export class JupiterModule {}
