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
var JupiterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = require("bs58");
const request_queue_service_1 = require("./request-queue.service");
let JupiterService = JupiterService_1 = class JupiterService {
    configService;
    requestQueue;
    logger = new common_1.Logger(JupiterService_1.name);
    jupiterBaseUrl;
    solanaRpcUrl;
    connection;
    wallet;
    axiosInstance;
    constructor(configService, requestQueue) {
        this.configService = configService;
        this.requestQueue = requestQueue;
        this.jupiterBaseUrl = this.configService.get('JUPITER_BASE_URL', 'https://quote-api.jup.ag/v6');
        this.solanaRpcUrl = this.configService.get('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
        const privateKey = this.configService.get('WALLET_PRIVATE_KEY');
        if (!privateKey) {
            throw new Error('WALLET_PRIVATE_KEY is not set');
        }
        this.wallet = web3_js_1.Keypair.fromSecretKey(new Uint8Array(bs58_1.default.decode(privateKey)));
    }
    async onModuleInit() {
        await this.initializeConnection();
    }
    async initializeConnection() {
        try {
            await this.initProxy();
            this.connection = new web3_js_1.Connection(this.solanaRpcUrl, 'confirmed');
        }
        catch (error) {
            this.logger.error('Connection initialization failed:', error.message);
            throw error;
        }
    }
    async initProxy() {
        const proxyUrl = this.configService.get('SOCKS5_PROXY');
        this.axiosInstance = axios_1.default.create();
        if (!proxyUrl) {
            this.logger.warn('No proxy configured, using direct connection');
            return;
        }
        try {
            const proxyAgent = proxyUrl.startsWith('http')
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
            await this.testProxyConnection(proxyAgent);
            this.axiosInstance = axios_1.default.create({
                httpAgent: proxyAgent,
                httpsAgent: proxyAgent,
                timeout: 10000,
            });
            this.logger.log('Proxy successfully configured and tested');
        }
        catch (error) {
            this.logger.warn(`Proxy configuration failed (${error.message}), falling back to direct connection`);
        }
    }
    async testProxyConnection(proxyAgent) {
        try {
            const testAxios = axios_1.default.create({
                httpAgent: proxyAgent,
                httpsAgent: proxyAgent,
                timeout: 5000,
            });
            const response = await testAxios.get('https://httpbin.org/ip');
            if (!response.data?.origin) {
                throw new Error('Invalid proxy test response');
            }
            this.logger.debug(`Proxy test successful. Connected from IP: ${response.data.origin}`);
        }
        catch (error) {
            this.logger.error('Proxy test failed:', error.message);
            throw new Error(`Proxy connection failed: ${error.message}`);
        }
    }
    async getQuote(inputMint, outputMint, amount, slippageBps = 50, restrictIntermediateTokens = true, dynamicSlippage = false) {
        return this.requestQueue.addRequest(async () => {
            try {
                const response = await this.axiosInstance.get(`${this.jupiterBaseUrl}/quote`, {
                    params: {
                        inputMint,
                        outputMint,
                        amount: amount.toString(),
                        slippageBps,
                        restrictIntermediateTokens,
                        dynamicSlippage,
                    },
                });
                if (response.data.swapUsdValue &&
                    typeof response.data.swapUsdValue !== 'number') {
                    response.data.swapUsdValue = parseFloat(response.data.swapUsdValue);
                }
                return response.data;
            }
            catch (error) {
                this.logger.error('Quote error:', error.response?.data || error.message);
                throw this.handleJupiterError(error);
            }
        });
    }
    handleJupiterError(error) {
        if (error.response?.status === 429) {
            return new Error('Jupiter API rate limit exceeded');
        }
        return new Error(`Jupiter API error: ${error.response?.data?.message || error.message}`);
    }
    async swap(quoteResponse, options = {}) {
        try {
            this.logger.log(`Building swap transaction for ${quoteResponse.inputMint} -> ${quoteResponse.outputMint}`);
            const swapOptions = {
                quoteResponse,
                userPublicKey: this.wallet.publicKey.toBase58(),
                dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
                dynamicSlippage: options.dynamicSlippage ?? false,
                asLegacyTransaction: options.asLegacyTransaction ?? false,
                skipPreflight: options.skipPreflight ?? false,
            };
            if (options.prioritizationFeeLamports) {
                swapOptions.prioritizationFeeLamports =
                    options.prioritizationFeeLamports;
            }
            if (options.feeAccount) {
                swapOptions.feeAccount = options.feeAccount;
            }
            const swapResponse = await this.getSwapTransaction(swapOptions);
            this.logger.debug(`Swap response: ${JSON.stringify(swapResponse, null, 2)}`);
            const { txid, confirmation } = await this.signAndSendTransaction(swapResponse.swapTransaction, {
                maxRetries: options.maxRetries ?? 2,
                skipPreflight: options.skipPreflight ?? false,
                commitment: options.commitment ?? 'confirmed',
                lastValidBlockHeight: swapResponse.lastValidBlockHeight,
                asLegacyTransaction: options.asLegacyTransaction ?? false,
            });
            this.logger.log(`Transaction ${txid} confirmed at slot ${confirmation.slot}`);
            return {
                txid,
                lastValidBlockHeight: swapResponse.lastValidBlockHeight,
                confirmation,
                swapResponse,
                quoteResponse,
            };
        }
        catch (error) {
            this.logger.error('Error performing swap:', error.response?.data || error.message);
            throw new Error(`Failed to perform swap: ${error.response?.data?.message || error.message}`);
        }
    }
    async getSwapTransaction(swapOptions) {
        const response = await axios_1.default.post(`${this.jupiterBaseUrl}/swap`, swapOptions);
        return response.data;
    }
    async signAndSendTransaction(transactionBase64, sendOptions) {
        try {
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            const transactionBuf = Buffer.from(transactionBase64, 'base64');
            if (sendOptions.asLegacyTransaction) {
                const transaction = web3_js_1.Transaction.from(transactionBuf);
                transaction.recentBlockhash = blockhash;
                transaction.lastValidBlockHeight = lastValidBlockHeight;
                transaction.sign(this.wallet);
                const txid = await this.connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: sendOptions.skipPreflight,
                    maxRetries: sendOptions.maxRetries || 5,
                });
                const confirmation = await this.connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, sendOptions.commitment);
                return { txid, confirmation: confirmation.value };
            }
            else {
                const versionedTx = web3_js_1.VersionedTransaction.deserialize(transactionBuf);
                const lookupTableAccounts = await Promise.all(versionedTx.message.addressTableLookups.map(async (lookup) => {
                    const accountInfo = await this.connection.getAccountInfo(lookup.accountKey);
                    if (!accountInfo) {
                        throw new Error(`Address lookup table not found: ${lookup.accountKey.toBase58()}`);
                    }
                    return new web3_js_1.AddressLookupTableAccount({
                        key: lookup.accountKey,
                        state: web3_js_1.AddressLookupTableAccount.deserialize(accountInfo.data),
                    });
                }));
                const loadedAddresses = this.createLoadedAddresses(versionedTx.message.addressTableLookups, lookupTableAccounts);
                const accountKeys = versionedTx.message.getAccountKeys({
                    accountKeysFromLookups: loadedAddresses,
                });
                const instructions = versionedTx.message.compiledInstructions.map((ix) => {
                    const programId = accountKeys.get(ix.programIdIndex);
                    if (!programId)
                        throw new Error(`Program ID not found at index ${ix.programIdIndex}`);
                    return new web3_js_1.TransactionInstruction({
                        programId,
                        keys: ix.accountKeyIndexes.map((accountIdx) => {
                            const pubkey = accountKeys.get(accountIdx);
                            if (!pubkey)
                                throw new Error(`Account key not found at index ${accountIdx}`);
                            return {
                                pubkey,
                                isSigner: versionedTx.message.isAccountSigner(accountIdx),
                                isWritable: versionedTx.message.isAccountWritable(accountIdx),
                            };
                        }),
                        data: Buffer.from(ix.data),
                    });
                });
                const newMessage = new web3_js_1.TransactionMessage({
                    payerKey: this.wallet.publicKey,
                    instructions,
                    recentBlockhash: blockhash,
                }).compileToV0Message(lookupTableAccounts);
                const transaction = new web3_js_1.VersionedTransaction(newMessage);
                transaction.sign([this.wallet]);
                const txid = await this.connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: sendOptions.skipPreflight,
                    maxRetries: sendOptions.maxRetries || 5,
                });
                const confirmation = await this.connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, sendOptions.commitment);
                return { txid, confirmation: confirmation.value };
            }
        }
        catch (error) {
            this.logger.error('Transaction error:', error);
            throw error;
        }
    }
    createLoadedAddresses(lookups, lookupTableAccounts) {
        const writable = [];
        const readonly = [];
        lookups.forEach((lookup, i) => {
            const table = lookupTableAccounts[i];
            lookup.writableIndexes.forEach((index) => {
                if (index < table.state.addresses.length) {
                    writable.push(table.state.addresses[index]);
                }
            });
            lookup.readonlyIndexes.forEach((index) => {
                if (index < table.state.addresses.length) {
                    readonly.push(table.state.addresses[index]);
                }
            });
        });
        return { writable, readonly };
    }
    reconstructInstructions(versionedTx) {
        const accountKeys = versionedTx.message.getAccountKeys();
        return versionedTx.message.compiledInstructions.map((ix) => {
            const programId = accountKeys.get(ix.programIdIndex);
            if (!programId)
                throw new Error(`Program ID not found at index ${ix.programIdIndex}`);
            return new web3_js_1.TransactionInstruction({
                programId,
                keys: ix.accountKeyIndexes.map((accountIdx) => {
                    const pubkey = accountKeys.get(accountIdx);
                    if (!pubkey)
                        throw new Error(`Account key not found at index ${accountIdx}`);
                    return {
                        pubkey,
                        isSigner: versionedTx.message.isAccountSigner(accountIdx),
                        isWritable: versionedTx.message.isAccountWritable(accountIdx),
                    };
                }),
                data: Buffer.from(ix.data),
            });
        });
    }
    async resolveAddressTables(lookups) {
        const writable = [];
        const readonly = [];
        await Promise.all(lookups.map(async (lookup) => {
            const accountInfo = await this.connection.getAccountInfo(lookup.accountKey);
            if (!accountInfo) {
                throw new Error(`Address lookup table not found: ${lookup.accountKey.toBase58()}`);
            }
            const table = new web3_js_1.AddressLookupTableAccount({
                key: lookup.accountKey,
                state: web3_js_1.AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            lookup.writableIndexes.forEach((index) => {
                if (index < table.state.addresses.length) {
                    writable.push(table.state.addresses[index]);
                }
            });
            lookup.readonlyIndexes.forEach((index) => {
                if (index < table.state.addresses.length) {
                    readonly.push(table.state.addresses[index]);
                }
            });
        }));
        return { writable, readonly };
    }
    async quoteAndSwap(inputMint, outputMint, amount, quoteOptions = {}, swapOptions = {}) {
        const quote = await this.getQuote(inputMint, outputMint, amount, quoteOptions.slippageBps, quoteOptions.restrictIntermediateTokens, quoteOptions.dynamicSlippage ?? swapOptions.dynamicSlippage);
        if (quoteOptions.minOutAmount &&
            BigInt(quote ? quote.outAmount : 0) < BigInt(quoteOptions.minOutAmount)) {
            throw new Error(`Quote out amount ${quote ? quote.outAmount : 0} is below minimum required ${quoteOptions.minOutAmount}`);
        }
        if (quoteOptions.maxOutAmount &&
            BigInt(quote ? quote.outAmount : 0) > BigInt(quoteOptions.maxOutAmount)) {
            throw new Error(`Quote out amount ${quote ? quote.outAmount : 0} is above maximum allowed ${quoteOptions.maxOutAmount}`);
        }
        if (quote) {
            return this.swap(quote, {
                ...swapOptions,
                dynamicSlippage: quoteOptions.dynamicSlippage ?? swapOptions.dynamicSlippage,
            });
        }
    }
    async getQuotes(inputMint, outputMint, amount, slippageBps = 50, dynamicSlippage = false) {
        try {
            const response = await axios_1.default.get(`${this.jupiterBaseUrl}/quote`, {
                params: {
                    inputMint,
                    outputMint,
                    amount: amount.toString(),
                    slippageBps,
                    onlyDirectRoutes: false,
                    dynamicSlippage,
                },
            });
            return response.data;
        }
        catch (error) {
            this.logger.error('Error fetching multiple quotes:', error.response?.data || error.message);
            throw new Error(`Failed to get quotes: ${error.response?.data?.message || error.message}`);
        }
    }
    async getTransactionStatus(txid, commitment = 'confirmed') {
        console.log('commitment:', commitment);
        try {
            const status = await this.connection.getSignatureStatus(txid, {
                searchTransactionHistory: true,
            });
            if (!status.value) {
                return { status: 'pending' };
            }
            if (status.value.err) {
                return {
                    status: 'failed',
                    err: status.value.err,
                    slot: status.value.slot,
                };
            }
            return {
                status: 'success',
                slot: status.value.slot,
            };
        }
        catch (error) {
            this.logger.error('Error getting transaction status:', error);
            throw new Error(`Failed to get transaction status: ${error.message}`);
        }
    }
};
exports.JupiterService = JupiterService;
exports.JupiterService = JupiterService = JupiterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        request_queue_service_1.RequestQueueService])
], JupiterService);
//# sourceMappingURL=jupiter.service.js.map