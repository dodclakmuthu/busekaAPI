import { IsOptional, IsUUID } from 'class-validator';
import { UpdateRouteRequestDto } from './update-route-request.dto';

export class ApproveRouteRequestDto extends UpdateRouteRequestDto {
	@IsOptional()
	@IsUUID()
	globalRouteId?: string;
}
