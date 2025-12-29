import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ChatController } from './controllers/chat.controller';
import { LlmService } from './services/llm.service';
import { FakeAuthMiddleware } from './middleware/fakeAuth.middleware';
import { TokenQuotaService } from './services/tokenQuota.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd()),
      exclude: ['/api*'],
    }),
  ],
  controllers: [ChatController],
  providers: [LlmService, TokenQuotaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FakeAuthMiddleware).forRoutes('*');
  }
}
