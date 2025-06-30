import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JupiterModule } from './jupiter/jupiter.module';
import { SwapController } from './swap/swap.controller';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';

@Module({
  imports: [
    JupiterModule,
    ConfigModule.forRoot({
      validate,
    }),
  ],
  controllers: [AppController, SwapController],
  providers: [AppService],
})
export class AppModule {}
