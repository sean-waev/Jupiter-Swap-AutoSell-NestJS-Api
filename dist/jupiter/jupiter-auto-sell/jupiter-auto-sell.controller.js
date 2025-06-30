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
exports.JupiterAutoSellController = void 0;
const common_1 = require("@nestjs/common");
const jupiter_auto_sell_service_1 = require("./jupiter-auto-sell.service");
let JupiterAutoSellController = class JupiterAutoSellController {
    autoSellService;
    constructor(autoSellService) {
        this.autoSellService = autoSellService;
    }
    async startAutoSell(body) {
        return this.autoSellService.startAutoSell({
            ...body,
            buyTime: new Date(body.buyTime),
        });
    }
};
exports.JupiterAutoSellController = JupiterAutoSellController;
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], JupiterAutoSellController.prototype, "startAutoSell", null);
exports.JupiterAutoSellController = JupiterAutoSellController = __decorate([
    (0, common_1.Controller)('auto-sell'),
    __metadata("design:paramtypes", [jupiter_auto_sell_service_1.JupiterAutoSellService])
], JupiterAutoSellController);
//# sourceMappingURL=jupiter-auto-sell.controller.js.map