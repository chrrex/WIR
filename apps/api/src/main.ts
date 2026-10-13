import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './common/config';

export async function configureApp(app: import('@nestjs/common').INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  // Die Web-App ruft die API über denselben Ursprung auf (Next.js-Proxy) – kein CORS nötig.
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  await configureApp(app);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // Ohne feste Adresse: IPv6 und IPv4 (Codespaces leitet über ::1 weiter), sonst nur IPv4
  await app.listen(config.port);
  console.log(`WIR-API läuft auf Port ${config.port}`);
  if (config.demoMode) console.warn('⚠ DEMO-MODUS AN: Anmeldung ohne Passwort möglich (nur mit Testdaten). Niemals mit echten Daten betreiben.');
}

if (require.main === module) {
  void bootstrap();
}
