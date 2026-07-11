import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';

/**
 * @Global so any module can inject AppLogger without importing LoggerModule
 * directly — logging is a cross-cutting concern like config.
 */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
