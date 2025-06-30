export declare class RequestQueueService {
    private readonly logger;
    private readonly queue;
    private readonly maxRetries;
    private readonly retryDelay;
    constructor();
    addRequest<T>(fn: () => Promise<T>): Promise<T>;
    private isRetryable;
    getQueueStats(): {
        pending: number;
        size: number;
        isPaused: boolean;
    };
}
