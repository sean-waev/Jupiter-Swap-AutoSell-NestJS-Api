import { JupiterService } from '../jupiter.service';
import { AutoSellConfig } from './interfaces/auto-sell.interface';
import { ConfigService } from '@nestjs/config';
export declare class JupiterAutoSellService {
    private configService;
    private readonly jupiterService;
    private readonly logger;
    private activeMonitors;
    private balanceCache;
    private lastBalanceFetch;
    private wallet;
    private connection;
    private readonly solanaRpcUrl;
    constructor(configService: ConfigService, jupiterService: JupiterService);
    startAutoSell(config: AutoSellConfig): Promise<{
        monitoringId: string;
    }>;
    private getTokenBalance;
    private monitorAndSell;
    private shouldSell;
    private logStatus;
    private getSolPrice;
}
