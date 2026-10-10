import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import type { PolicyContext } from '../policy/engine';
import { AdminService } from './admin.service';

type Req = { policy: PolicyContext };

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @RequirePermission('users.read')
  @Get('users')
  list(@Req() req: Req, @Query('status') status?: string) {
    const allowed = ['PROVISIONED', 'INVITED', 'ACTIVE', 'LOCKED', 'DEACTIVATED'];
    return this.admin.listUsers(req.policy, status && allowed.includes(status) ? status : undefined);
  }

  @RequirePermission('users.manage')
  @Post('users/:id/activate')
  @HttpCode(200)
  activate(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.activate(req.policy, me.id, id);
  }

  @RequirePermission('users.reset_password')
  @Post('users/:id/one-time-code')
  @HttpCode(200)
  code(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.newCode(req.policy, me.id, id);
  }

  @RequirePermission('users.deactivate')
  @Post('users/:id/deactivate')
  @HttpCode(200)
  deactivate(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deactivate(req.policy, me.id, id);
  }

  @RequirePermission('audit.read')
  @Get('audit')
  audit(@Req() req: Req, @Query('limit') limit?: string) {
    return this.admin.auditLog(req.policy, Number(limit ?? 50) || 50);
  }
}
