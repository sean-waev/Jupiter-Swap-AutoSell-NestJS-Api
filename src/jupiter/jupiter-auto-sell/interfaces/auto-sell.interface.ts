export interface AutoSellConfig {
  inputMint: string;
  inAmount: string;
  initialUsdValue: number; // USD value when position was opened
  targetUsdValue?: number; // Optional target USD value
  buyTime: Date;
  maxRetries?: number;
  slippageBps?: number;
  minUsdValue?: number; // Stop-loss USD value
}
