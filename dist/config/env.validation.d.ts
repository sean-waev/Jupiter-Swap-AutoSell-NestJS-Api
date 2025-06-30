declare class EnvironmentVariables {
    SOLANA_RPC_URL: string;
    JUPITER_BASE_URL: string;
    WALLET_PRIVATE_KEY: string;
}
export declare function validate(config: Record<string, unknown>): EnvironmentVariables;
export {};
