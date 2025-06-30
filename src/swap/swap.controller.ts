import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import {
  JupiterService,
  QuoteResponse,
  SwapOptions,
  TransactionResult,
} from '../jupiter/jupiter.service';
@Controller('swap')
export class SwapController {
  constructor(private readonly jupiterService: JupiterService) {}

  /**
   * Get a quote for token swap
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount to swap (in lamports/atomic units)
   * @param slippageBps - Slippage tolerance in basis points (1% = 100bps)
   * @param restrictIntermediate - Restrict intermediate tokens in route
   * @param dynamicSlippage - Enable dynamic slippage adjustment
   * @returns QuoteResponse
   */
  @Get('quote/:inputMint/:outputMint/:amount')
  async getQuote(
    @Param('inputMint') inputMint: string,
    @Param('outputMint') outputMint: string,
    @Param('amount') amount: string,
    @Query('slippage') slippage?: number,
    @Query('restrictIntermediate') restrictIntermediate?: boolean,
    @Query('dynamicSlippage') dynamicSlippage?: boolean,
  ): Promise<QuoteResponse | void> {
    return this.jupiterService.getQuote(
      inputMint,
      outputMint,
      amount,
      slippage,
      restrictIntermediate,
      dynamicSlippage,
    );
  }

  /**
   * Execute a swap with a pre-obtained quote
   * @param body - Contains quoteResponse and swap options
   * @returns TransactionResult
   */
  @Post('execute')
  async executeSwap(
    @Body() body: { quoteResponse: QuoteResponse; options?: SwapOptions },
  ): Promise<TransactionResult> {
    return this.jupiterService.swap(body.quoteResponse, body.options);
  }

  /**
   * Get a quote and execute swap in one call
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount to swap (in lamports/atomic units)
   * @param minOutAmount - Minimum acceptable output amount
   * @param maxOutAmount - Maximum acceptable output amount
   * @param slippage - Slippage tolerance in basis points
   * @param restrictIntermediate - Restrict intermediate tokens
   * @param dynamicSlippage - Enable dynamic slippage
   * @param maxRetries - Max retries for transaction
   * @param skipPreflight - Skip preflight checks
   * @param priorityLevel - Priority level (none|low|medium|high|veryHigh)
   * @param maxPriorityFee - Max priority fee in lamports
   * @param jitoTip - Jito tip amount in lamports
   * @returns TransactionResult
   */
  @Get('quote-and-execute/:inputMint/:outputMint/:amount')
  async quoteAndExecute(
    @Param('inputMint') inputMint: string,
    @Param('outputMint') outputMint: string,
    @Param('amount') amount: string,
    @Query('minOutAmount') minOutAmount?: string,
    @Query('maxOutAmount') maxOutAmount?: string,
    @Query('slippage') slippage?: number,
    @Query('restrictIntermediate') restrictIntermediate?: boolean,
    @Query('dynamicSlippage') dynamicSlippage?: boolean,
    @Query('maxRetries') maxRetries?: number,
    @Query('skipPreflight') skipPreflight?: boolean,
    @Query('priorityLevel')
    priorityLevel?: 'none' | 'low' | 'medium' | 'high' | 'veryHigh',
    @Query('maxPriorityFee') maxPriorityFee?: number,
    @Query('jitoTip') jitoTip?: number,
  ): Promise<TransactionResult | undefined> {
    const quoteOptions = {
      slippageBps: slippage,
      restrictIntermediateTokens: restrictIntermediate,
      minOutAmount,
      maxOutAmount,
      dynamicSlippage: dynamicSlippage === true,
    };

    const swapOptions: SwapOptions = {
      dynamicSlippage: dynamicSlippage === true,
      maxRetries: maxRetries ? Number(maxRetries) : undefined,
      skipPreflight: skipPreflight === true,
    };

    // Add priority fee configuration if provided
    if (priorityLevel || maxPriorityFee) {
      swapOptions.prioritizationFeeLamports = {
        priorityLevelWithMaxLamports: {
          priorityLevel: priorityLevel || 'medium',
          maxLamports: maxPriorityFee ? Number(maxPriorityFee) : 10000000, // Default 0.01 SOL max
        },
      };
    }

    // Add Jito tip if provided
    if (jitoTip) {
      swapOptions.prioritizationFeeLamports =
        swapOptions.prioritizationFeeLamports || {};
      swapOptions.prioritizationFeeLamports.jitoTipLamports = Number(jitoTip);
    }

    return this.jupiterService.quoteAndSwap(
      inputMint,
      outputMint,
      amount,
      quoteOptions,
      swapOptions,
    );
  }

  /**
   * Get multiple route quotes for a token pair
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount to swap (in lamports/atomic units)
   * @param slippage - Slippage tolerance in basis points
   * @param dynamicSlippage - Enable dynamic slippage
   * @returns Array of QuoteResponse
   */
  @Get('quotes/:inputMint/:outputMint/:amount')
  async getQuotes(
    @Param('inputMint') inputMint: string,
    @Param('outputMint') outputMint: string,
    @Param('amount') amount: string,
    @Query('slippage') slippage?: number,
    @Query('dynamicSlippage') dynamicSlippage?: boolean,
  ): Promise<QuoteResponse[]> {
    return this.jupiterService.getQuotes(
      inputMint,
      outputMint,
      amount,
      slippage,
      dynamicSlippage,
    );
  }

  /**
   * Get transaction status
   * @param txid - Transaction ID to check
   * @param commitment - Commitment level (processed|confirmed|finalized)
   * @returns Transaction status information
   */
  @Get('status/:txid')
  async getTransactionStatus(
    @Param('txid') txid: string,
    @Query('commitment') commitment?: 'processed' | 'confirmed' | 'finalized',
  ) {
    return this.jupiterService.getTransactionStatus(txid, commitment);
  }
}
