import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Commitment } from '@solana/web3.js';
import { RequestQueueService } from './request-queue.service';
export interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: 'ExactIn' | 'ExactOut';
    slippageBps: number;
    platformFee: null | {
        amount: string;
        feeBps: number;
    };
    priceImpactPct: string;
    routePlan: Array<{
        swapInfo: {
            ammKey: string;
            label: string;
            inputMint: string;
            outputMint: string;
            inAmount: string;
            outAmount: string;
            feeAmount: string;
            feeMint: string;
        };
        percent: number;
    }>;
    contextSlot: number;
    timeTaken: number;
    swapUsdValue: number;
}
export interface SwapResponse {
    swapTransaction: string;
    lastValidBlockHeight: number;
    prioritizationFeeLamports?: number;
    computeUnitLimit?: number;
    prioritizationType?: {
        computeBudget: {
            microLamports: number;
            estimatedMicroLamports: number;
        };
    };
    dynamicSlippageReport?: {
        slippageBps: number;
        otherAmount: number;
        simulatedIncurredSlippageBps: number;
        amplificationRatio: string;
        categoryName: string;
        heuristicMaxSlippageBps: number;
    };
    simulationError?: string | null;
}
export interface SwapOptions {
    dynamicComputeUnitLimit?: boolean;
    dynamicSlippage?: boolean;
    prioritizationFeeLamports?: {
        priorityLevelWithMaxLamports?: {
            maxLamports: number;
            priorityLevel: 'none' | 'low' | 'medium' | 'high' | 'veryHigh';
            global?: boolean;
        };
        computeBudget?: {
            microLamports: number;
        };
        jitoTipLamports?: number;
    };
    asLegacyTransaction?: boolean;
    feeAccount?: string;
    skipPreflight?: boolean;
    maxRetries?: number;
    commitment?: Commitment;
}
export interface TransactionResult {
    txid: string;
    lastValidBlockHeight: number;
    confirmation: {
        commitment: Commitment;
        confirmations?: number;
        err: any;
        slot: number;
    };
    swapResponse: SwapResponse;
    quoteResponse?: QuoteResponse;
}
export declare class JupiterService implements OnModuleInit {
    private configService;
    private requestQueue;
    private readonly logger;
    private readonly jupiterBaseUrl;
    private readonly solanaRpcUrl;
    private connection;
    private wallet;
    private axiosInstance;
    constructor(configService: ConfigService, requestQueue: RequestQueueService);
    onModuleInit(): Promise<void>;
    private initializeConnection;
    private initProxy;
    private testProxyConnection;
    getQuote(inputMint: string, outputMint: string, amount: number | string, slippageBps?: number, restrictIntermediateTokens?: boolean, dynamicSlippage?: boolean): Promise<void | QuoteResponse>;
    private handleJupiterError;
    swap(quoteResponse: QuoteResponse, options?: SwapOptions): Promise<TransactionResult>;
    private getSwapTransaction;
    private signAndSendTransaction;
    private createLoadedAddresses;
    private reconstructInstructions;
    private resolveAddressTables;
    quoteAndSwap(inputMint: string, outputMint: string, amount: number | string, quoteOptions?: {
        slippageBps?: number;
        restrictIntermediateTokens?: boolean;
        minOutAmount?: string;
        maxOutAmount?: string;
        dynamicSlippage?: boolean;
    }, swapOptions?: SwapOptions): Promise<TransactionResult | undefined>;
    getQuotes(inputMint: string, outputMint: string, amount: number | string, slippageBps?: number, dynamicSlippage?: boolean): Promise<QuoteResponse[]>;
    getTransactionStatus(txid: string, commitment?: Commitment): Promise<{
        status: 'success' | 'failed' | 'pending';
        slot?: number;
        err?: any;
    }>;
}
