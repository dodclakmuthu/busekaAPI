import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../auth/auth.types';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { CompanyGuard } from '../company/guards/company.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

type AuthedRequest = Request & { user: SafeUser };

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @GetCompany() company: { id: string },
    @Req() req: AuthedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.list(company.id, req.user.id, query);
  }

  @Get('unread-count')
  unreadCount(@GetCompany() company: { id: string }, @Req() req: AuthedRequest) {
    return this.notificationsService.unreadCount(company.id, req.user.id);
  }

  @Patch('read-all')
  markAllRead(@GetCompany() company: { id: string }, @Req() req: AuthedRequest) {
    return this.notificationsService.markAllRead(company.id, req.user.id);
  }

  @Patch(':id/read')
  markRead(
    @GetCompany() company: { id: string },
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(company.id, req.user.id, id);
  }
}