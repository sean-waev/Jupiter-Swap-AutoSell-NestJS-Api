/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  Commitment,
  AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
  AccountMeta,
  TransactionInstruction,
  MessageAddressTableLookup,
  LoadedAddresses,
} from '@solana/web3.js';
import bs58 from 'bs58';
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
  /**
   * @default true
   * @description Enable dynamic compute unit limit to optimize for transaction landing
   */
  dynamicComputeUnitLimit?: boolean;

  /**
   * @default false
   * @description Enable dynamic slippage adjustment based on market conditions
   */
  dynamicSlippage?: boolean;

  /**
   * @description Priority fee configuration for the transaction
   */
  prioritizationFeeLamports?: {
    /**
     * @description Priority level with maximum lamports to spend
     */
    priorityLevelWithMaxLamports?: {
      maxLamports: number;
      priorityLevel: 'none' | 'low' | 'medium' | 'high' | 'veryHigh';
      global?: boolean;
    };

    /**
     * @description Fixed micro lamports per compute unit
     */
    computeBudget?: {
      microLamports: number;
    };

    /**
     * @description Jito tip in lamports (fixed amount)
     */
    jitoTipLamports?: number;
  };

  /**
   * @default false
   * @description Use versioned transaction (recommended for new implementations)
   */
  asLegacyTransaction?: boolean;

  /**
   * @description Public key to use for fee destination
   */
  feeAccount?: string;

  /**
   * @default false
   * @description Skip preflight checks (faster but less reliable)
   */
  skipPreflight?: boolean;

  /**
   * @default 2
   * @description Number of retries for sending the transaction
   */
  maxRetries?: number;

  /**
   * @default 'confirmed'
   * @description Transaction confirmation commitment level
   */
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

@Injectable()
export class JupiterService implements OnModuleInit {
  private readonly logger = new Logger(JupiterService.name);
  private readonly jupiterBaseUrl: string;
  private readonly solanaRpcUrl: string;
  private connection: Connection;
  private wallet: Keypair;
  private axiosInstance: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private requestQueue: RequestQueueService,
  ) {
    this.jupiterBaseUrl = this.configService.get<string>(
      'JUPITER_BASE_URL',
      'https://quote-api.jup.ag/v6',
    );
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

  async onModuleInit() {
    await this.initializeConnection();
  }

  private async initializeConnection() {
    try {
      await this.initProxy();
      this.connection = new Connection(this.solanaRpcUrl, 'confirmed');
    } catch (error) {
      this.logger.error('Connection initialization failed:', error.message);
      throw error;
    }
  }

  private async initProxy() {
    const proxyUrl = this.configService.get<string>('SOCKS5_PROXY');

    // Initialize without proxy first
    this.axiosInstance = axios.create();

    if (!proxyUrl) {
      this.logger.warn('No proxy configured, using direct connection');
      return;
    }

    try {
      const proxyAgent = proxyUrl.startsWith('http')
        ? new HttpsProxyAgent(proxyUrl)
        : new SocksProxyAgent(proxyUrl);

      // Test proxy with a reliable public API
      await this.testProxyConnection(proxyAgent);

      // If successful, create new axios instance with proxy
      this.axiosInstance = axios.create({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        timeout: 10000,
      });

      this.logger.log('Proxy successfully configured and tested');
    } catch (error) {
      this.logger.warn(
        `Proxy configuration failed (${error.message}), falling back to direct connection`,
      );
    }
  }

  private async testProxyConnection(
    proxyAgent: SocksProxyAgent | HttpsProxyAgent,
  ): Promise<void> {
    try {
      // Use a simple, reliable public API for testing
      const testAxios = axios.create({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        timeout: 5000,
      });

      // Test with a public API that always responds
      const response = await testAxios.get('https://httpbin.org/ip');

      if (!response.data?.origin) {
        throw new Error('Invalid proxy test response');
      }

      this.logger.debug(
        `Proxy test successful. Connected from IP: ${response.data.origin}`,
      );
    } catch (error) {
      this.logger.error('Proxy test failed:', error.message);
      throw new Error(`Proxy connection failed: ${error.message}`);
    }
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number | string,
    slippageBps = 50,
    restrictIntermediateTokens = true,
    dynamicSlippage = false,
  ): Promise<void | QuoteResponse> {
    return this.requestQueue.addRequest(async () => {
      try {
        const response = await this.axiosInstance.get<QuoteResponse>(
          `${this.jupiterBaseUrl}/quote`,
          {
            params: {
              inputMint,
              outputMint,
              amount: amount.toString(),
              slippageBps,
              restrictIntermediateTokens,
              dynamicSlippage,
            },
          },
        );

        // Ensure swapUsdValue is a number
        if (
          response.data.swapUsdValue &&
          typeof response.data.swapUsdValue !== 'number'
        ) {
          response.data.swapUsdValue = parseFloat(response.data.swapUsdValue);
        }

        return response.data;
      } catch (error) {
        this.logger.error(
          'Quote error:',
          error.response?.data || error.message,
        );
        throw this.handleJupiterError(error);
      }
    });
  }

  private handleJupiterError(error: any): Error {
    if (error.response?.status === 429) {
      return new Error('Jupiter API rate limit exceeded');
    }
    return new Error(
      `Jupiter API error: ${error.response?.data?.message || error.message}`,
    );
  }
  /**
   * Build, sign, and send a swap transaction with optimization for landing
   * @param quoteResponse - Quote response from getQuote
   * @param options - Additional swap options
   * @returns Promise<TransactionResult>
   */
  async swap(
    quoteResponse: QuoteResponse,
    options: SwapOptions = {},
  ): Promise<TransactionResult> {
    try {
      this.logger.log(
        `Building swap transaction for ${quoteResponse.inputMint} -> ${quoteResponse.outputMint}`,
      );

      const swapOptions: any = {
        quoteResponse,
        userPublicKey: this.wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
        dynamicSlippage: options.dynamicSlippage ?? false,
        asLegacyTransaction: options.asLegacyTransaction ?? false,
        skipPreflight: options.skipPreflight ?? false,
      };

      // Apply priority fee options if provided
      if (options.prioritizationFeeLamports) {
        swapOptions.prioritizationFeeLamports =
          options.prioritizationFeeLamports;
      }

      if (options.feeAccount) {
        swapOptions.feeAccount = options.feeAccount;
      }

      // Get the swap transaction from Jupiter API
      const swapResponse = await this.getSwapTransaction(swapOptions);
      this.logger.debug(
        `Swap response: ${JSON.stringify(swapResponse, null, 2)}`,
      );

      // Deserialize, sign, and send the transaction
      const { txid, confirmation } = await this.signAndSendTransaction(
        swapResponse.swapTransaction,
        {
          maxRetries: options.maxRetries ?? 2,
          skipPreflight: options.skipPreflight ?? false,
          commitment: options.commitment ?? 'confirmed',
          lastValidBlockHeight: swapResponse.lastValidBlockHeight,
          asLegacyTransaction: options.asLegacyTransaction ?? false,
        },
      );

      this.logger.log(
        `Transaction ${txid} confirmed at slot ${confirmation.slot}`,
      );

      return {
        txid,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight,
        confirmation,
        swapResponse,
        quoteResponse,
      };
    } catch (error) {
      this.logger.error(
        'Error performing swap:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to perform swap: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get swap transaction from Jupiter API
   * @param swapOptions - Swap options to send to Jupiter API
   * @returns Promise<SwapResponse>
   */
  private async getSwapTransaction(swapOptions: any): Promise<SwapResponse> {
    const response = await axios.post<SwapResponse>(
      `${this.jupiterBaseUrl}/swap`,
      swapOptions,
    );
    return response.data;
  }

  /**
   * Sign and send a transaction with proper error handling and retries
   * @param transactionBase64 - Base64 encoded transaction
   * @param sendOptions - Options for sending the transaction
   * @returns Promise<{ txid: string, confirmation: any }>
   */
  private async signAndSendTransaction(
    transactionBase64: string,
    sendOptions: {
      maxRetries: number;
      skipPreflight: boolean;
      commitment: Commitment;
      lastValidBlockHeight: number;
      asLegacyTransaction: boolean;
    },
  ): Promise<{ txid: string; confirmation: any }> {
    try {
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      const transactionBuf = Buffer.from(transactionBase64, 'base64');

      if (sendOptions.asLegacyTransaction) {
        // Handle legacy transaction
        const transaction = Transaction.from(transactionBuf);
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.sign(this.wallet);

        const txid = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: sendOptions.skipPreflight,
            maxRetries: sendOptions.maxRetries || 5,
          },
        );

        const confirmation = await this.connection.confirmTransaction(
          { signature: txid, blockhash, lastValidBlockHeight },
          sendOptions.commitment,
        );

        return { txid, confirmation: confirmation.value };
      } else {
        // Handle versioned transaction
        const versionedTx = VersionedTransaction.deserialize(transactionBuf);

        // 1. First resolve all address lookup tables
        const lookupTableAccounts = await Promise.all(
          versionedTx.message.addressTableLookups.map(async (lookup) => {
            const accountInfo = await this.connection.getAccountInfo(
              lookup.accountKey,
            );
            if (!accountInfo) {
              throw new Error(
                `Address lookup table not found: ${lookup.accountKey.toBase58()}`,
              );
            }
            return new AddressLookupTableAccount({
              key: lookup.accountKey,
              state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
          }),
        );

        // 2. Create loaded addresses object
        const loadedAddresses = this.createLoadedAddresses(
          versionedTx.message.addressTableLookups,
          lookupTableAccounts,
        );

        // 3. Get complete account keys (now including resolved lookup addresses)
        const accountKeys = versionedTx.message.getAccountKeys({
          accountKeysFromLookups: loadedAddresses,
        });

        // 4. Reconstruct instructions with all resolved addresses
        const instructions = versionedTx.message.compiledInstructions.map(
          (ix) => {
            const programId = accountKeys.get(ix.programIdIndex);
            if (!programId)
              throw new Error(
                `Program ID not found at index ${ix.programIdIndex}`,
              );

            return new TransactionInstruction({
              programId,
              keys: ix.accountKeyIndexes.map((accountIdx) => {
                const pubkey = accountKeys.get(accountIdx);
                if (!pubkey)
                  throw new Error(
                    `Account key not found at index ${accountIdx}`,
                  );
                return {
                  pubkey,
                  isSigner: versionedTx.message.isAccountSigner(accountIdx),
                  isWritable: versionedTx.message.isAccountWritable(accountIdx),
                } as AccountMeta;
              }),
              data: Buffer.from(ix.data),
            });
          },
        );

        // 5. Create new transaction message with original lookups but resolved accounts
        const newMessage = new TransactionMessage({
          payerKey: this.wallet.publicKey,
          instructions,
          recentBlockhash: blockhash,
        }).compileToV0Message(lookupTableAccounts);

        const transaction = new VersionedTransaction(newMessage);
        transaction.sign([this.wallet]);

        const txid = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: sendOptions.skipPreflight,
            maxRetries: sendOptions.maxRetries || 5,
          },
        );

        const confirmation = await this.connection.confirmTransaction(
          { signature: txid, blockhash, lastValidBlockHeight },
          sendOptions.commitment,
        );

        return { txid, confirmation: confirmation.value };
      }
    } catch (error) {
      this.logger.error('Transaction error:', error);
      throw error;
    }
  }

  private createLoadedAddresses(
    lookups: MessageAddressTableLookup[],
    lookupTableAccounts: AddressLookupTableAccount[],
  ): LoadedAddresses {
    const writable: PublicKey[] = [];
    const readonly: PublicKey[] = [];

    lookups.forEach((lookup, i) => {
      const table = lookupTableAccounts[i];

      // Add writable addresses
      lookup.writableIndexes.forEach((index) => {
        if (index < table.state.addresses.length) {
          writable.push(table.state.addresses[index]);
        }
      });

      // Add readonly addresses
      lookup.readonlyIndexes.forEach((index) => {
        if (index < table.state.addresses.length) {
          readonly.push(table.state.addresses[index]);
        }
      });
    });

    return { writable, readonly };
  }

  private reconstructInstructions(
    versionedTx: VersionedTransaction,
  ): TransactionInstruction[] {
    const accountKeys = versionedTx.message.getAccountKeys();

    return versionedTx.message.compiledInstructions.map((ix) => {
      const programId = accountKeys.get(ix.programIdIndex);
      if (!programId)
        throw new Error(`Program ID not found at index ${ix.programIdIndex}`);

      return new TransactionInstruction({
        programId,
        keys: ix.accountKeyIndexes.map((accountIdx) => {
          const pubkey = accountKeys.get(accountIdx);
          if (!pubkey)
            throw new Error(`Account key not found at index ${accountIdx}`);
          return {
            pubkey,
            isSigner: versionedTx.message.isAccountSigner(accountIdx),
            isWritable: versionedTx.message.isAccountWritable(accountIdx),
          } as AccountMeta;
        }),
        data: Buffer.from(ix.data),
      });
    });
  }
  private async resolveAddressTables(
    lookups: MessageAddressTableLookup[],
  ): Promise<LoadedAddresses> {
    const writable: PublicKey[] = [];
    const readonly: PublicKey[] = [];

    await Promise.all(
      lookups.map(async (lookup) => {
        const accountInfo = await this.connection.getAccountInfo(
          lookup.accountKey,
        );
        if (!accountInfo) {
          throw new Error(
            `Address lookup table not found: ${lookup.accountKey.toBase58()}`,
          );
        }

        const table = new AddressLookupTableAccount({
          key: lookup.accountKey,
          state: AddressLookupTableAccount.deserialize(accountInfo.data),
        });

        // Add addresses to the appropriate arrays
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
      }),
    );

    return { writable, readonly };
  }
  /**
   * Get a quote and execute swap in one call with optimized transaction sending
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount to swap (in lamports/atomic units)
   * @param quoteOptions - Options for the quote
   * @param swapOptions - Options for the swap
   * @returns Combined quote and swap results
   */
  async quoteAndSwap(
    inputMint: string,
    outputMint: string,
    amount: number | string,
    quoteOptions: {
      slippageBps?: number;
      restrictIntermediateTokens?: boolean;
      minOutAmount?: string;
      maxOutAmount?: string;
      dynamicSlippage?: boolean;
    } = {},
    swapOptions: SwapOptions = {},
  ): Promise<TransactionResult | undefined> {
    // Get the quote first
    const quote = await this.getQuote(
      inputMint,
      outputMint,
      amount,
      quoteOptions.slippageBps,
      quoteOptions.restrictIntermediateTokens,
      quoteOptions.dynamicSlippage ?? swapOptions.dynamicSlippage,
    );

    // Validate the quote against conditions
    if (
      quoteOptions.minOutAmount &&
      BigInt(quote ? quote.outAmount : 0) < BigInt(quoteOptions.minOutAmount)
    ) {
      throw new Error(
        `Quote out amount ${quote ? quote.outAmount : 0} is below minimum required ${quoteOptions.minOutAmount}`,
      );
    }

    if (
      quoteOptions.maxOutAmount &&
      BigInt(quote ? quote.outAmount : 0) > BigInt(quoteOptions.maxOutAmount)
    ) {
      throw new Error(
        `Quote out amount ${quote ? quote.outAmount : 0} is above maximum allowed ${quoteOptions.maxOutAmount}`,
      );
    }
    if (quote) {
      // Execute the swap if quote is acceptable
      return this.swap(quote, {
        ...swapOptions,
        // Ensure dynamic slippage is consistent between quote and swap if enabled
        dynamicSlippage:
          quoteOptions.dynamicSlippage ?? swapOptions.dynamicSlippage,
      });
    }
  }

  /**
   * Get multiple route quotes for a token pair
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount to swap
   * @param slippageBps - Slippage tolerance
   * @param dynamicSlippage - Enable dynamic slippage
   * @returns Array of possible quotes
   */
  async getQuotes(
    inputMint: string,
    outputMint: string,
    amount: number | string,
    slippageBps: number = 50,
    dynamicSlippage: boolean = false,
  ): Promise<QuoteResponse[]> {
    try {
      const response = await axios.get<QuoteResponse[]>(
        `${this.jupiterBaseUrl}/quote`,
        {
          params: {
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps,
            onlyDirectRoutes: false,
            dynamicSlippage,
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Error fetching multiple quotes:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get quotes: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get transaction status and confirmations
   * @param txid - Transaction ID to check
   * @param commitment - Commitment level
   * @returns Transaction status and confirmations
   */
  async getTransactionStatus(
    txid: string,
    commitment: Commitment = 'confirmed',
  ): Promise<{
    status: 'success' | 'failed' | 'pending';
    slot?: number;
    err?: any;
  }> {
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
    } catch (error) {
      this.logger.error('Error getting transaction status:', error);
      throw new Error(`Failed to get transaction status: ${error.message}`);
    }
  }
}
