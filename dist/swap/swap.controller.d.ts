import { JupiterService, QuoteResponse, SwapOptions, TransactionResult } from '../jupiter/jupiter.service';
export declare class SwapController {
    private readonly jupiterService;
    constructor(jupiterService: JupiterService);
    getQuote(inputMint: string, outputMint: string, amount: string, slippage?: number, restrictIntermediate?: boolean, dynamicSlippage?: boolean): Promise<QuoteResponse | void>;
    executeSwap(body: {
        quoteResponse: QuoteResponse;
        options?: SwapOptions;
    }): Promise<TransactionResult>;
    quoteAndExecute(inputMint: string, outputMint: string, amount: string, minOutAmount?: string, maxOutAmount?: string, slippage?: number, restrictIntermediate?: boolean, dynamicSlippage?: boolean, maxRetries?: number, skipPreflight?: boolean, priorityLevel?: 'none' | 'low' | 'medium' | 'high' | 'veryHigh', maxPriorityFee?: number, jitoTip?: number): Promise<TransactionResult | undefined>;
    getQuotes(inputMint: string, outputMint: string, amount: string, slippage?: number, dynamicSlippage?: boolean): Promise<QuoteResponse[]>;
    getTransactionStatus(txid: string, commitment?: 'processed' | 'confirmed' | 'finalized'): Promise<{
        status: "success" | "failed" | "pending";
        slot?: number;
        err?: any;
    }>;
}
