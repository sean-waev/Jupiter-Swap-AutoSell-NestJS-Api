/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-useless-catch */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import PQueue from 'p-queue';
import { setTimeout } from 'timers/promises';

@Injectable()
export class RequestQueueService {
  private readonly logger = new Logger(RequestQueueService.name);
  private readonly queue: PQueue;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor() {
    this.queue = new PQueue({
      concurrency: 2,
      interval: 1500,
      intervalCap: 2,
      timeout: 30000,
    });

    this.maxRetries = 6;
    this.retryDelay = 2000;
  }

  async addRequest<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.queue.add<Promise<T>>(async () => {
          try {
            return await fn();
          } catch (error) {
            throw error; // Re-throw to be caught by the outer try-catch
          }
        });
        if (result) {
          return result;
        }
      } catch (error) {
        if (attempt >= this.maxRetries || !this.isRetryable(error)) {
          throw error;
        }
        this.logger.warn(`Retrying request (attempt ${attempt + 1})`);
        await setTimeout(this.retryDelay * attempt);
      }
    }
    throw new Error('Max retries exceeded');
  }

  private isRetryable(error: any): boolean {
    // Retry on network errors or rate limits
    if (error.message?.includes('ECONN')) return true;
    if (error.code === 'ECONNABORTED') return true;
    if (error.response?.status === 429) return true;
    if (error.response?.status >= 500) return true;
    return false;
  }

  getQueueStats() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      isPaused: this.queue.isPaused,
    };
  }
}
