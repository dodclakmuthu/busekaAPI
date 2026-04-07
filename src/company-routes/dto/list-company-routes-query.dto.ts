import { IsIn, IsOptional } from 'class-validator';

const APPROVAL_STATUSES = [
  'DRAFT',
  'PRIVATE_ACTIVE',
  'PENDING_APPROVAL',
  'PENDING_UPDATE_APPROVAL',
  'APPROVED',
  'REJECTED',
  'UPDATE_REJECTED',
] as const;

type RouteApprovalStatusValue = (typeof APPROVAL_STATUSES)[number];

export class ListCompanyRoutesQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  approvalStatus?: RouteApprovalStatusValue;
}
