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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapController = void 0;
const common_1 = require("@nestjs/common");
const jupiter_service_1 = require("../jupiter/jupiter.service");
let SwapController = class SwapController {
    jupiterService;
    constructor(jupiterService) {
        this.jupiterService = jupiterService;
    }
    async getQuote(inputMint, outputMint, amount, slippage, restrictIntermediate, dynamicSlippage) {
        return this.jupiterService.getQuote(inputMint, outputMint, amount, slippage, restrictIntermediate, dynamicSlippage);
    }
    async executeSwap(body) {
        return this.jupiterService.swap(body.quoteResponse, body.options);
    }
    async quoteAndExecute(inputMint, outputMint, amount, minOutAmount, maxOutAmount, slippage, restrictIntermediate, dynamicSlippage, maxRetries, skipPreflight, priorityLevel, maxPriorityFee, jitoTip) {
        const quoteOptions = {
            slippageBps: slippage,
            restrictIntermediateTokens: restrictIntermediate,
            minOutAmount,
            maxOutAmount,
            dynamicSlippage: dynamicSlippage === true,
        };
        const swapOptions = {
            dynamicSlippage: dynamicSlippage === true,
            maxRetries: maxRetries ? Number(maxRetries) : undefined,
            skipPreflight: skipPreflight === true,
        };
        if (priorityLevel || maxPriorityFee) {
            swapOptions.prioritizationFeeLamports = {
                priorityLevelWithMaxLamports: {
                    priorityLevel: priorityLevel || 'medium',
                    maxLamports: maxPriorityFee ? Number(maxPriorityFee) : 10000000,
                },
            };
        }
        if (jitoTip) {
            swapOptions.prioritizationFeeLamports =
                swapOptions.prioritizationFeeLamports || {};
            swapOptions.prioritizationFeeLamports.jitoTipLamports = Number(jitoTip);
        }
        return this.jupiterService.quoteAndSwap(inputMint, outputMint, amount, quoteOptions, swapOptions);
    }
    async getQuotes(inputMint, outputMint, amount, slippage, dynamicSlippage) {
        return this.jupiterService.getQuotes(inputMint, outputMint, amount, slippage, dynamicSlippage);
    }
    async getTransactionStatus(txid, commitment) {
        return this.jupiterService.getTransactionStatus(txid, commitment);
    }
};
exports.SwapController = SwapController;
__decorate([
    (0, common_1.Get)('quote/:inputMint/:outputMint/:amount'),
    __param(0, (0, common_1.Param)('inputMint')),
    __param(1, (0, common_1.Param)('outputMint')),
    __param(2, (0, common_1.Param)('amount')),
    __param(3, (0, common_1.Query)('slippage')),
    __param(4, (0, common_1.Query)('restrictIntermediate')),
    __param(5, (0, common_1.Query)('dynamicSlippage')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Boolean, Boolean]),
    __metadata("design:returntype", Promise)
], SwapController.prototype, "getQuote", null);
__decorate([
    (0, common_1.Post)('execute'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SwapController.prototype, "executeSwap", null);
__decorate([
    (0, common_1.Get)('quote-and-execute/:inputMint/:outputMint/:amount'),
    __param(0, (0, common_1.Param)('inputMint')),
    __param(1, (0, common_1.Param)('outputMint')),
    __param(2, (0, common_1.Param)('amount')),
    __param(3, (0, common_1.Query)('minOutAmount')),
    __param(4, (0, common_1.Query)('maxOutAmount')),
    __param(5, (0, common_1.Query)('slippage')),
    __param(6, (0, common_1.Query)('restrictIntermediate')),
    __param(7, (0, common_1.Query)('dynamicSlippage')),
    __param(8, (0, common_1.Query)('maxRetries')),
    __param(9, (0, common_1.Query)('skipPreflight')),
    __param(10, (0, common_1.Query)('priorityLevel')),
    __param(11, (0, common_1.Query)('maxPriorityFee')),
    __param(12, (0, common_1.Query)('jitoTip')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, Number, Boolean, Boolean, Number, Boolean, String, Number, Number]),
    __metadata("design:returntype", Promise)
], SwapController.prototype, "quoteAndExecute", null);
__decorate([
    (0, common_1.Get)('quotes/:inputMint/:outputMint/:amount'),
    __param(0, (0, common_1.Param)('inputMint')),
    __param(1, (0, common_1.Param)('outputMint')),
    __param(2, (0, common_1.Param)('amount')),
    __param(3, (0, common_1.Query)('slippage')),
    __param(4, (0, common_1.Query)('dynamicSlippage')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Boolean]),
    __metadata("design:returntype", Promise)
], SwapController.prototype, "getQuotes", null);
__decorate([
    (0, common_1.Get)('status/:txid'),
    __param(0, (0, common_1.Param)('txid')),
    __param(1, (0, common_1.Query)('commitment')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SwapController.prototype, "getTransactionStatus", null);
exports.SwapController = SwapController = __decorate([
    (0, common_1.Controller)('swap'),
    __metadata("design:paramtypes", [jupiter_service_1.JupiterService])
], SwapController);
//# sourceMappingURL=swap.controller.js.map