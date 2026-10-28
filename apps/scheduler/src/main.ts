import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 2909;

  await app.listen(port);

  if (typeof (global as any).gc === 'function') {
    (global as any).gc();
    console.log('🧹 Garbage collection executed in Scheduler after bootstrap.');
  }

  console.log(`Scheduler Service is running on: http://localhost:${port}`);
}
bootstrap();
