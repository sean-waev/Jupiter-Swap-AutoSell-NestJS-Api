import { JupiterAutoSellService } from './jupiter-auto-sell.service';
export declare class JupiterAutoSellController {
    private readonly autoSellService;
    constructor(autoSellService: JupiterAutoSellService);
    startAutoSell(body: {
        inputMint: string;
        inAmount: string;
        initialUsdValue: number;
        minUsdValue?: number;
        buyTime: string;
        slippageBps?: number;
        maxRetries?: number;
    }): Promise<{
        monitoringId: string;
    }>;
}
