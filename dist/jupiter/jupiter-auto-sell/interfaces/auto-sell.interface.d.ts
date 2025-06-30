export interface AutoSellConfig {
    inputMint: string;
    inAmount: string;
    initialUsdValue: number;
    targetUsdValue?: number;
    buyTime: Date;
    maxRetries?: number;
    slippageBps?: number;
    minUsdValue?: number;
}
