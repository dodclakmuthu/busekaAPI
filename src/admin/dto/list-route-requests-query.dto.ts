import { IsIn, IsOptional } from 'class-validator';

const APPROVAL_STATUSES = [
  'PENDING_APPROVAL',
  'PENDING_UPDATE_APPROVAL',
  'APPROVED',
  'REJECTED',
  'UPDATE_REJECTED',
] as const;

type RouteRequestStatus = (typeof APPROVAL_STATUSES)[number];

export class ListRouteRequestsQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  status?: RouteRequestStatus;
}
