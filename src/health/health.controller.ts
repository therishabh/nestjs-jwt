import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { RawResponse } from '../common/decorators/raw-response.decorator';

/**
 * Used by load balancers / orchestrators (Kubernetes liveness/readiness
 * probes, an Nginx upstream check, etc.) to decide whether this instance is
 * healthy enough to receive traffic. It must stay @Public() — an
 * orchestrator has no JWT to send — and it must be genuinely useful, so it
 * actually pings MongoDB rather than just returning a static 200.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Public()
  @RawResponse()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb')]);
  }
}
