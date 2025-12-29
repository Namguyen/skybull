import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class FakeAuthMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: (...args: any[]) => void) {
    req.user = {
      id: 'dev_user',
      role: 'developer',
    } as any;
    next();
  }
}
