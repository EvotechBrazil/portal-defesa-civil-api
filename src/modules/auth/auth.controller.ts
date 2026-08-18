import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
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
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/verify-email')
  verifyEmail(@Body() body: TokenDto) {
    return this.authService.verifyEmail(body);
  }

  @Public()
  @HttpCode(202)
  @Post('auth/resend-verification')
  resendVerification(@Body() body: EmailDto) {
    return this.authService.resendVerification(body);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body);
  }

  @Public()
  @HttpCode(204)
  @Post('auth/logout')
  logout(@Body() body: RefreshDto) {
    return this.authService.logout(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }
}
