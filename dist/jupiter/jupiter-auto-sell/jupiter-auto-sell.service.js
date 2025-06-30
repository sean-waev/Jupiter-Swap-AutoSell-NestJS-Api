"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var JupiterAutoSellService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterAutoSellService = void 0;
const common_1 = require("@nestjs/common");
const jupiter_service_1 = require("../jupiter.service");
const promises_1 = require("timers/promises");
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("@nestjs/config");
const bs58_1 = require("bs58");
let JupiterAutoSellService = JupiterAutoSellService_1 = class JupiterAutoSellService {
    configService;
    jupiterService;
    logger = new common_1.Logger(JupiterAutoSellService_1.name);
    activeMonitors = new Map();
    balanceCache = new Map();
    lastBalanceFetch = new Map();
    wallet;
    connection;
    solanaRpcUrl;
    constructor(configService, jupiterService) {
        this.configService = configService;
        this.jupiterService = jupiterService;
        this.solanaRpcUrl = this.configService.get('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
        const privateKey = this.configService.get('WALLET_PRIVATE_KEY');
        if (!privateKey) {
            throw new Error('WALLET_PRIVATE_KEY is not set');
        }
        this.wallet = web3_js_1.Keypair.fromSecretKey(new Uint8Array(bs58_1.default.decode(privateKey)));
    }
    async startAutoSell(config) {
        const monitoringId = `${config.inputMint}-${Date.now()}`;
        this.connection = new web3_js_1.Connection(this.solanaRpcUrl, 'confirmed');
        let initialBalance;
        let attempts = 0;
        const maxAttempts = 4;
        const delay = (ms) => {
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
            }
            catch (error) {
                this.logger.error(`Attempt ${attempts} failed to get token balance: ${error.message}`);
                if (attempts < maxAttempts) {
                    await delay(1000);
                }
            }
        }
        if (initialBalance === undefined) {
            throw new Error(`Failed to get balance for ${config.inputMint} after ${maxAttempts} attempts`);
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
    async getTokenBalance(mintAddress) {
        const cacheKey = `${mintAddress}-${this.wallet.publicKey.toBase58()}`;
        const lastFetch = this.lastBalanceFetch.get(cacheKey) || 0;
        const now = Date.now();
        if (now - lastFetch < 300000 && this.balanceCache.has(cacheKey)) {
            return this.balanceCache.get(cacheKey);
        }
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(this.wallet.publicKey, { mint: new web3_js_1.PublicKey(mintAddress) });
            if (tokenAccounts.value.length === 0) {
                throw new Error(`No token account found for mint: ${mintAddress}`);
            }
            const largestAccount = tokenAccounts.value.reduce((prev, current) => {
                const prevAmount = BigInt(prev.account.data.parsed.info.tokenAmount.amount);
                const currentAmount = BigInt(current.account.data.parsed.info.tokenAmount.amount);
                return prevAmount > currentAmount ? prev : current;
            });
            const balance = largestAccount.account.data.parsed.info.tokenAmount.amount;
            this.balanceCache.set(cacheKey, balance);
            this.lastBalanceFetch.set(cacheKey, now);
            return balance;
        }
        catch (error) {
            this.logger.error(`Balance check failed for ${mintAddress}:`, error);
            throw error;
        }
    }
    async monitorAndSell(config, initialBalance, signal) {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        let attempts = 0;
        while (!signal.aborted && attempts < (config.maxRetries || 20)) {
            try {
                const balance = await this.getTokenBalance(config.inputMint);
                if (balance === '0') {
                    this.logger.warn(`Zero balance for ${config.inputMint}, stopping monitor`);
                    return;
                }
                const quote = await this.jupiterService.getQuote(config.inputMint, SOL_MINT, initialBalance, config.slippageBps || 9900, true, true);
                let currentUsdValue;
                if (quote &&
                    quote.swapUsdValue !== undefined &&
                    quote.swapUsdValue !== null) {
                    currentUsdValue =
                        typeof quote.swapUsdValue === 'string'
                            ? parseFloat(quote.swapUsdValue)
                            : Number(quote.swapUsdValue);
                    this.logger.debug(`Using quote USD value: ${currentUsdValue}`);
                }
                else {
                    const solPrice = await this.getSolPrice();
                    if (quote) {
                        currentUsdValue = parseFloat(quote.outAmount) * solPrice;
                        this.logger.debug(`Calculated USD value: ${currentUsdValue} (from SOL price ${solPrice})`);
                    }
                    else {
                        currentUsdValue = 0;
                    }
                }
                if (isNaN(currentUsdValue) && quote) {
                    throw new Error(`Invalid USD value: ${quote.swapUsdValue} (converted to ${currentUsdValue})`);
                }
                const profitPercent = ((currentUsdValue - config.initialUsdValue) /
                    config.initialUsdValue) *
                    100;
                const { shouldSell, reason } = this.shouldSell({
                    currentUsdValue,
                    initialUsdValue: config.initialUsdValue,
                    minUsdValue: config.minUsdValue,
                    buyTime: config.buyTime,
                    timeHeldMs: Date.now() - config.buyTime.getTime(),
                });
                this.logStatus(config.inputMint, currentUsdValue, profitPercent, shouldSell, reason);
                if (shouldSell && quote) {
                    await this.jupiterService.swap(quote);
                    return;
                }
                await (0, promises_1.setTimeout)(1000, undefined, { signal });
            }
            catch (error) {
                attempts++;
                this.logger.error(`Attempt ${attempts} failed:`, error.message);
                if (error.response?.data) {
                    this.logger.debug('API Error Details:', error.response.data);
                }
                await (0, promises_1.setTimeout)(3000, undefined, { signal });
            }
        }
    }
    shouldSell(params) {
        const { currentUsdValue, initialUsdValue, minUsdValue, timeHeldMs, maxProfitPercent: currentMaxProfit = 0, } = params;
        const timeHeldMinutes = timeHeldMs / (1000 * 60);
        const profitPercent = ((currentUsdValue - initialUsdValue) / initialUsdValue) * 100;
        const newMaxProfitPercent = Math.max(currentMaxProfit, profitPercent);
        if (minUsdValue && currentUsdValue <= minUsdValue) {
            const lossPercent = ((initialUsdValue - currentUsdValue) / initialUsdValue) * 100;
            return {
                shouldSell: true,
                reason: `STOP LOSS (${lossPercent.toFixed(2)}% loss)`,
                maxProfitPercent: newMaxProfitPercent,
            };
        }
        if (timeHeldMinutes >= 20) {
            return {
                shouldSell: true,
                reason: `TIME HELD OVER 20M maxprof: ${newMaxProfitPercent}`,
                maxProfitPercent: newMaxProfitPercent,
            };
        }
        if (newMaxProfitPercent > 39 && profitPercent <= -5) {
            return {
                shouldSell: true,
                reason: `Profit peaked at ${newMaxProfitPercent.toFixed(2)}% (sell at <= -5%)`,
                maxProfitPercent: newMaxProfitPercent,
            };
        }
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
    logStatus(inputMint, currentUsdValue, profitPercent, shouldSell, reason) {
        try {
            const mintDisplay = inputMint.length > 6 ? `${inputMint.substring(0, 6)}...` : inputMint;
            const formattedValue = typeof currentUsdValue === 'number'
                ? currentUsdValue.toFixed(2)
                : 'N/A';
            const formattedProfit = typeof profitPercent === 'number' ? profitPercent.toFixed(2) : 'N/A';
            const message = shouldSell
                ? `🚀 SELL ${mintDisplay} at $${formattedValue} (${formattedProfit}% profit) - ${reason}`
                : `⏳ HOLD ${mintDisplay} | Value:$${formattedValue} | Profit: ${formattedProfit}%`;
            this.logger.log(message);
        }
        catch (error) {
            this.logger.error('Logging error:', error);
        }
    }
    async getSolPrice() {
        return 150;
    }
};
exports.JupiterAutoSellService = JupiterAutoSellService;
exports.JupiterAutoSellService = JupiterAutoSellService = JupiterAutoSellService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        jupiter_service_1.JupiterService])
], JupiterAutoSellService);
//# sourceMappingURL=jupiter-auto-sell.service.js.map