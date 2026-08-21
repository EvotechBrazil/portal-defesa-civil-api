import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AccessService } from './access.service';
import { CheckWhatsappDto } from './dtos/check-whatsapp.dto';
import { RequestAccessDto } from './dtos/request-access.dto';

@ApiTags('access')
@Throttle({ auth: { limit: 10, ttl: 60_000 } })
@Controller()
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Public()
  @HttpCode(200)
  @Post('auth/check-whatsapp')
  checkWhatsapp(@Body() body: CheckWhatsappDto) {
    return this.accessService.checkWhatsapp(body);
  }

  @Public()
  @Post('auth/access-requests')
  requestAccess(@Body() body: RequestAccessDto) {
    return this.accessService.requestAccess(body);
  }
}
