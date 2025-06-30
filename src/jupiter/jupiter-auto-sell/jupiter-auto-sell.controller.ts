/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Body, Controller, Post } from '@nestjs/common';
import { JupiterAutoSellService } from './jupiter-auto-sell.service';

@Controller('auto-sell')
export class JupiterAutoSellController {
  constructor(private readonly autoSellService: JupiterAutoSellService) {}

  @Post('start')
  async startAutoSell(
    @Body()
    body: {
      inputMint: string;
      inAmount: string;
      initialUsdValue: number;
      minUsdValue?: number;
      buyTime: string;
      slippageBps?: number;
      maxRetries?: number;
    },
  ) {
    return this.autoSellService.startAutoSell({
      ...body,
      buyTime: new Date(body.buyTime),
    });
  }

  //   @Delete('stop/:monitoringId')
  //   stopAutoSell(@Param('monitoringId') monitoringId: string) {
  //     this.autoSellService.stopAutoSell(monitoringId);
  //   }
}
