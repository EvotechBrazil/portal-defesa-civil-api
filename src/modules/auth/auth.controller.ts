import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { EmailDto } from './dtos/email.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshDto } from './dtos/refresh.dto';
import { RegisterDto } from './dtos/register.dto';
import { TokenDto } from './dtos/token.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('auth/register')
  register(@Body() _body: RegisterDto) {
    return this.authService.register();
  }

  @Public()
  @Post('auth/verify-email')
  verifyEmail(@Body() _body: TokenDto) {
    return this.authService.verifyEmail();
  }

  @Public()
  @HttpCode(202)
  @Post('auth/resend-verification')
  resendVerification(@Body() _body: EmailDto) {
    return this.authService.resendVerification();
  }

  @Public()
  @Post('auth/login')
  login(@Body() _body: LoginDto) {
    return this.authService.login();
  }

  @Public()
  @Post('auth/refresh')
  refresh(@Body() _body: RefreshDto) {
    return this.authService.refresh();
  }

  @Public()
  @HttpCode(204)
  @Post('auth/logout')
  logout(@Body() _body: RefreshDto) {
    return this.authService.logout();
  }

  @Get('me')
  me() {
    return this.authService.me();
  }
}
