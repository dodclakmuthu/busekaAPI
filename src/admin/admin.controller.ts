import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppAdminGuard } from '../auth/app-admin.guard';
import { SafeUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { CreateRouteMasterDto } from './dto/create-route-master.dto';
import { UpdateRouteMasterDto } from './dto/update-route-master.dto';
import { ListRouteRequestsQueryDto } from './dto/list-route-requests-query.dto';
import { UpdateRouteRequestDto } from './dto/update-route-request.dto';
import { ApproveRouteRequestDto } from './dto/approve-route-request.dto';
import { RejectRouteRequestDto } from './dto/reject-route-request.dto';

type AuthedRequest = Request & { user: SafeUser };

@UseGuards(JwtAuthGuard, AppAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /admin/stats */
  @Get('stats')
  getStats() {
    return this.adminService.getDashboardStats();
  }

  /** GET /admin/route-masters?includeInactive=true */
  @Get('route-masters')
  listRouteMasters(@Query('includeInactive') includeInactive?: string) {
    return this.adminService.listRouteMasters(includeInactive === 'true');
  }

  /** GET /admin/routes?includeInactive=true */
  @Get('routes')
  listGlobalRoutes(@Query('includeInactive') includeInactive?: string) {
    return this.adminService.listRouteMasters(includeInactive === 'true');
  }

  /** GET /admin/route-masters/:id */
  @Get('route-masters/:id')
  getRouteMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getRouteMaster(id);
  }

  /** POST /admin/route-masters */
  @Post('route-masters')
  createRouteMaster(@Body() dto: CreateRouteMasterDto) {
    return this.adminService.createRouteMaster(dto);
  }

  /** POST /admin/routes */
  @Post('routes')
  createGlobalRoute(@Body() dto: CreateRouteMasterDto) {
    return this.adminService.createRouteMaster(dto);
  }

  /** PATCH /admin/route-masters/:id */
  @Patch('route-masters/:id')
  updateRouteMaster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteMasterDto,
  ) {
    return this.adminService.updateRouteMaster(id, dto);
  }

  /** PATCH /admin/routes/:id */
  @Patch('routes/:id')
  updateGlobalRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteMasterDto,
  ) {
    return this.adminService.updateRouteMaster(id, dto);
  }

  /** DELETE /admin/route-masters/:id */
  @Delete('route-masters/:id')
  deleteRouteMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteRouteMaster(id);
  }

  /** DELETE /admin/routes/:id */
  @Delete('routes/:id')
  deleteGlobalRoute(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteRouteMaster(id);
  }

  /** GET /admin/route-requests?status=PENDING_APPROVAL */
  @Get('route-requests')
  listRouteRequests(@Query() query: ListRouteRequestsQueryDto) {
    return this.adminService.listRouteRequests(query);
  }

  /** GET /admin/route-requests/:id/history */
  @Get('route-requests/:id/history')
  getRouteRequestHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getRouteRequestHistory(id);
  }

  /** GET /admin/route-requests/:id/approval-status */
  @Get('route-requests/:id/approval-status')
  getRouteRequestApprovalStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getRouteRequestApprovalStatus(id);
  }

  /** GET /admin/route-requests/:id */
  @Get('route-requests/:id')
  getRouteRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getRouteRequest(id);
  }

  /** PATCH /admin/route-requests/:id */
  @Patch('route-requests/:id')
  updateRouteRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteRequestDto,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.updateRouteRequest(id, dto, req.user.id);
  }

  /** POST /admin/route-requests/:id/approve */
  @Post('route-requests/:id/approve')
  approveRouteRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRouteRequestDto,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.approveRouteRequest(id, dto, req.user.id);
  }

  /** POST /admin/route-requests/:id/reject */
  @Post('route-requests/:id/reject')
  rejectRouteRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRouteRequestDto,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.rejectRouteRequest(id, dto, req.user.id);
  }
}
