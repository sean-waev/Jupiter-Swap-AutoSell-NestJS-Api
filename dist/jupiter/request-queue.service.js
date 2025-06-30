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
var RequestQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueService = void 0;
const common_1 = require("@nestjs/common");
const p_queue_1 = require("p-queue");
const promises_1 = require("timers/promises");
let RequestQueueService = RequestQueueService_1 = class RequestQueueService {
    logger = new common_1.Logger(RequestQueueService_1.name);
    queue;
    maxRetries;
    retryDelay;
    constructor() {
        this.queue = new p_queue_1.default({
            concurrency: 2,
            interval: 1500,
            intervalCap: 2,
            timeout: 30000,
        });
        this.maxRetries = 6;
        this.retryDelay = 2000;
    }
    async addRequest(fn) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await this.queue.add(async () => {
                    try {
                        return await fn();
                    }
                    catch (error) {
                        throw error;
                    }
                });
                if (result) {
                    return result;
                }
            }
            catch (error) {
                if (attempt >= this.maxRetries || !this.isRetryable(error)) {
                    throw error;
                }
                this.logger.warn(`Retrying request (attempt ${attempt + 1})`);
                await (0, promises_1.setTimeout)(this.retryDelay * attempt);
            }
        }
        throw new Error('Max retries exceeded');
    }
    isRetryable(error) {
        if (error.message?.includes('ECONN'))
            return true;
        if (error.code === 'ECONNABORTED')
            return true;
        if (error.response?.status === 429)
            return true;
        if (error.response?.status >= 500)
            return true;
        return false;
    }
    getQueueStats() {
        return {
            pending: this.queue.pending,
            size: this.queue.size,
            isPaused: this.queue.isPaused,
        };
    }
};
exports.RequestQueueService = RequestQueueService;
exports.RequestQueueService = RequestQueueService = RequestQueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RequestQueueService);
//# sourceMappingURL=request-queue.service.js.map