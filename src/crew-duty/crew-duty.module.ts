import { Module } from '@nestjs/common';
import { CrewDutyController } from './crew-duty.controller';
import { CrewDutyService } from './crew-duty.service';
import { TripsModule } from '../trips/trips.module';

// PrismaModule is @Global() — no need to import it here.
// CrewDutyJwtStrategy is registered in CrewDutyAuthModule (already loaded in AppModule)
// so AuthGuard('crew-duty-jwt') resolves at runtime automatically.
@Module({
  imports: [TripsModule],
  controllers: [CrewDutyController],
  providers: [CrewDutyService],
})
export class CrewDutyModule {}
