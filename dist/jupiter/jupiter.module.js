"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jupiter_service_1 = require("./jupiter.service");
const jupiter_auto_sell_service_1 = require("./jupiter-auto-sell/jupiter-auto-sell.service");
const jupiter_auto_sell_controller_1 = require("./jupiter-auto-sell/jupiter-auto-sell.controller");
const request_queue_service_1 = require("./request-queue.service");
let JupiterModule = class JupiterModule {
};
exports.JupiterModule = JupiterModule;
exports.JupiterModule = JupiterModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [jupiter_service_1.JupiterService, jupiter_auto_sell_service_1.JupiterAutoSellService, request_queue_service_1.RequestQueueService],
        controllers: [jupiter_auto_sell_controller_1.JupiterAutoSellController],
        exports: [jupiter_service_1.JupiterService, jupiter_auto_sell_service_1.JupiterAutoSellService],
    })
], JupiterModule);
//# sourceMappingURL=jupiter.module.js.map