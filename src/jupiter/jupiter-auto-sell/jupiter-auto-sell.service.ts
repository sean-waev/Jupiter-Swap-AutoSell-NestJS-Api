/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import { JupiterService } from '../jupiter.service';
import { setTimeout } from 'timers/promises';
import { AutoSellConfig } from './interfaces/auto-sell.interface';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import bs58 from 'bs58';

interface MonitoringInstance {
  stop: () => void;
  initialBalance: string; // Store balance when monitoring starts
}

@Injectable()
export class JupiterAutoSellService {
  private readonly logger = new Logger(JupiterAutoSellService.name);
  private activeMonitors = new Map<string, MonitoringInstance>();
  private balanceCache = new Map<string, string>(); // Cache balances by mint address
  private lastBalanceFetch = new Map<string, number>(); // Track last fetch time
  // private activeMonitors = new Map<string, { stop: () => void }>();
  private wallet: Keypair;
  private connection: Connection;
  private readonly solanaRpcUrl: string;

  constructor(
    private configService: ConfigService,
    private readonly jupiterService: JupiterService,
  ) {
    this.solanaRpcUrl = this.configService.get<string>(
      'SOLANA_RPC_URL',
      'https://api.mainnet-beta.solana.com',
    );

    // Initialize wallet
    const privateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY is not set');
    }
    this.wallet = Keypair.fromSecretKey(
      new Uint8Array(bs58.decode(privateKey)),
    );
  }

  async startAutoSell(
    config: AutoSellConfig,
  ): Promise<{ monitoringId: string }> {
    const monitoringId = `${config.inputMint}-${Date.now()}`;
    this.connection = new Connection(this.solanaRpcUrl, 'confirmed');

    // Get balance with retry logic (up to 4 attempts or until we get a defined value)
    let initialBalance: string | undefined;
    let attempts = 0;
    const maxAttempts = 4;

    // Alternative delay implementation using async/await
    const delay = (ms: number) => {
      return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });
    };

    while (attempts < maxAttempts && initialBalance === undefined) {
      attempts++;
      try {
        initialBalance = await this.getTokenBalance(config.inputMint);
        if (initialBalance === undefined && attempts < maxAttempts) {
          await delay(1000);
        }
      } catch (error) {
        this.logger.error(
          `Attempt ${attempts} failed to get token balance: ${error.message}`,
        );
        if (attempts < maxAttempts) {
          await delay(1000);
        }
      }
    }

    if (initialBalance === undefined) {
      throw new Error(
        `Failed to get balance for ${config.inputMint} after ${maxAttempts} attempts`,
      );
    }

    if (initialBalance === '0') {
      throw new Error(`Zero balance for ${config.inputMint}`);
    }

    const controller = new AbortController();
    const stopMonitor = () => {
      controller.abort();
      this.activeMonitors.delete(monitoringId);
    };

    this.activeMonitors.set(monitoringId, {
      stop: stopMonitor,
      initialBalance,
    });

    this.monitorAndSell(config, initialBalance, controller.signal)
      .catch((err) => this.logger.error(`Monitor error: ${err.message}`))
      .finally(() => this.activeMonitors.delete(monitoringId));

    return { monitoringId };
  }
  private async getTokenBalance(mintAddress: string): Promise<string> {
    // Check cache first (with 5 minute expiry)
    const cacheKey = `${mintAddress}-${this.wallet.publicKey.toBase58()}`;
    const lastFetch = this.lastBalanceFetch.get(cacheKey) || 0;
    const now = Date.now();

    if (now - lastFetch < 300000 && this.balanceCache.has(cacheKey)) {
      // 5 minute cache
      return this.balanceCache.get(cacheKey)!;
    }

    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: new PublicKey(mintAddress) },
      );

      if (tokenAccounts.value.length === 0) {
        throw new Error(`No token account found for mint: ${mintAddress}`);
      }

      const largestAccount = tokenAccounts.value.reduce((prev, current) => {
        const prevAmount = BigInt(
          prev.account.data.parsed.info.tokenAmount.amount,
        );
        const currentAmount = BigInt(
          current.account.data.parsed.info.tokenAmount.amount,
        );
        return prevAmount > currentAmount ? prev : current;
      });

      const balance =
        largestAccount.account.data.parsed.info.tokenAmount.amount;

      // Update cache
      this.balanceCache.set(cacheKey, balance);
      this.lastBalanceFetch.set(cacheKey, now);

      return balance;
    } catch (error) {
      this.logger.error(`Balance check failed for ${mintAddress}:`, error);
      throw error;
    }
  }

  private async monitorAndSell(
    config: AutoSellConfig,
    initialBalance: string,
    signal: AbortSignal,
    // monitoringId: string,
  ) {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    let attempts = 0;

    while (!signal.aborted && attempts < (config.maxRetries || 20)) {
      try {
        // 1. Get current token balance
        const balance = await this.getTokenBalance(config.inputMint);
        if (balance === '0') {
          this.logger.warn(
            `Zero balance for ${config.inputMint}, stopping monitor`,
          );
          return;
        }
        // 1. Get current quote
        const quote = await this.jupiterService.getQuote(
          config.inputMint,
          SOL_MINT,
          initialBalance, // Use exact balance
          config.slippageBps || 9900,
          true,
          true,
        );

        // 2. Robust USD value extraction
        let currentUsdValue: number;

        // Handle both string and number swapUsdValue
        if (
          quote &&
          quote.swapUsdValue !== undefined &&
          quote.swapUsdValue !== null
        ) {
          currentUsdValue =
            typeof quote.swapUsdValue === 'string'
              ? parseFloat(quote.swapUsdValue) // Remove commas if present
              : Number(quote.swapUsdValue);

          this.logger.debug(`Using quote USD value: ${currentUsdValue}`);
        } else {
          // Fallback calculation
          const solPrice = await this.getSolPrice();
          if (quote) {
            currentUsdValue = parseFloat(quote.outAmount) * solPrice;
            this.logger.debug(
              `Calculated USD value: ${currentUsdValue} (from SOL price ${solPrice})`,
            );
          } else {
            currentUsdValue = 0;
          }
        }

        // 3. Validate the USD value
        if (isNaN(currentUsdValue) && quote) {
          throw new Error(
            `Invalid USD value: ${quote.swapUsdValue} (converted to ${currentUsdValue})`,
          );
        }

        // 4. Calculate profit percentage
        const profitPercent =
          ((currentUsdValue - config.initialUsdValue) /
            config.initialUsdValue) *
          100;

        // 5. Check sell conditions
        const { shouldSell, reason } = this.shouldSell({
          currentUsdValue,
          initialUsdValue: config.initialUsdValue,
          minUsdValue: config.minUsdValue,
          buyTime: config.buyTime,
          timeHeldMs: Date.now() - config.buyTime.getTime(),
        });

        // 6. Log status (with additional validation)
        this.logStatus(
          config.inputMint,
          currentUsdValue,
          profitPercent,
          shouldSell,
          reason,
        );

        // 7. Execute sell if conditions met
        if (shouldSell && quote) {
          await this.jupiterService.swap(quote);
          return;
        }

        await setTimeout(1000, undefined, { signal });
      } catch (error) {
        attempts++;
        this.logger.error(`Attempt ${attempts} failed:`, error.message);
        if (error.response?.data) {
          this.logger.debug('API Error Details:', error.response.data);
        }
        await setTimeout(3000, undefined, { signal });
      }
    }
  }
  private shouldSell(params: {
    currentUsdValue: number;
    initialUsdValue: number;
    minUsdValue?: number;
    buyTime: Date;
    timeHeldMs: number;
    // Adding maxProfitPercent to track the highest profit reached
    maxProfitPercent?: number;
  }): { shouldSell: boolean; reason: string; maxProfitPercent: number } {
    const {
      currentUsdValue,
      initialUsdValue,
      minUsdValue,
      timeHeldMs,
      maxProfitPercent: currentMaxProfit = 0,
    } = params;
    const timeHeldMinutes = timeHeldMs / (1000 * 60);

    // Calculate current profit percentage
    const profitPercent =
      ((currentUsdValue - initialUsdValue) / initialUsdValue) * 100;

    // Update max profit percentage
    const newMaxProfitPercent = Math.max(currentMaxProfit, profitPercent);

    // Stop-loss check
    if (minUsdValue && currentUsdValue <= minUsdValue) {
      const lossPercent =
        ((initialUsdValue - currentUsdValue) / initialUsdValue) * 100;
      return {
        shouldSell: true,
        reason: `STOP LOSS (${lossPercent.toFixed(2)}% loss)`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }

    // Time-based conditions
    if (timeHeldMinutes >= 20) {
      return {
        shouldSell: true,
        reason: `TIME HELD OVER 20M maxprof: ${newMaxProfitPercent}`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }

    // NEW CONDITION 1: If profit ever went over 39%, sell at or below 9%
    if (newMaxProfitPercent > 39 && profitPercent <= -5) {
      return {
        shouldSell: true,
        reason: `Profit peaked at ${newMaxProfitPercent.toFixed(2)}% (sell at <= -5%)`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }

    // Existing profit-based conditions
    if (timeHeldMinutes >= 8) {
      if (profitPercent <= -30) {
        return {
          shouldSell: true,
          reason: `profitPercent <= -30 STOP LOSS) maxprof: ${newMaxProfitPercent}`,
          maxProfitPercent: newMaxProfitPercent,
        };
      }
      if (newMaxProfitPercent > 17 && profitPercent <= -5) {
        return {
          shouldSell: true,
          reason: `After 8m, profit peaked at ${newMaxProfitPercent.toFixed(2)}% (sell at <= -5%)`,
          maxProfitPercent: newMaxProfitPercent,
        };
      }
      return {
        shouldSell: profitPercent >= 40,
        reason: `40% Target (8m+) maxprof: ${newMaxProfitPercent}`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }
    // NEW CONDITION 2: After 8 minutes, if profit ever went over 19%, sell at or below -5%
    if (timeHeldMinutes >= 2) {
      if (profitPercent <= -30) {
        return {
          shouldSell: true,
          reason: `profitPercent <= -30 STOP LOSS) maxprof: ${newMaxProfitPercent}`,
          maxProfitPercent: newMaxProfitPercent,
        };
      }
      if (newMaxProfitPercent > 17 && profitPercent <= -5) {
        return {
          shouldSell: true,
          reason: `After 8m, profit peaked at ${newMaxProfitPercent.toFixed(2)}% (sell at <= -5%)`,
          maxProfitPercent: newMaxProfitPercent,
        };
      }
      return {
        shouldSell: profitPercent >= 20,
        reason: `20% Target (4m+) maxprof: ${newMaxProfitPercent}`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }
    // if (timeHeldMinutes >= 17) {
    //   return {
    //     shouldSell: profitPercent >= 25,
    //     reason: '25% Target (17m+)',
    //     maxProfitPercent: newMaxProfitPercent,
    //   };
    // }

    if (profitPercent < -50) {
      return {
        shouldSell: true,
        reason: `profitPercent <= -50 STOP LOSS) maxprof: ${newMaxProfitPercent}`,
        maxProfitPercent: newMaxProfitPercent,
      };
    }

    return {
      shouldSell: profitPercent >= 20,
      reason: `20% Target maxprof: ${newMaxProfitPercent}`,
      maxProfitPercent: newMaxProfitPercent,
    };
  }

  private logStatus(
    inputMint: string,
    currentUsdValue: number,
    profitPercent: number,
    shouldSell: boolean,
    reason: string,
  ) {
    try {
      const mintDisplay =
        inputMint.length > 6 ? `${inputMint.substring(0, 6)}...` : inputMint;

      // Safely format numbers
      const formattedValue =
        typeof currentUsdValue === 'number'
          ? currentUsdValue.toFixed(2)
          : 'N/A';

      const formattedProfit =
        typeof profitPercent === 'number' ? profitPercent.toFixed(2) : 'N/A';

      const message = shouldSell
        ? `🚀 SELL ${mintDisplay} at $${formattedValue} (${formattedProfit}% profit) - ${reason}`
        : `⏳ HOLD ${mintDisplay} | Value:$${formattedValue} | Profit: ${formattedProfit}%`;

      this.logger.log(message);
    } catch (error) {
      this.logger.error('Logging error:', error);
    }
  }

  // Helper method if USD price isn't in quote
  private async getSolPrice(): Promise<number> {
    // Implement your SOL price fetch logic here
    return 150; // Example SOL price in USD
  }
}
