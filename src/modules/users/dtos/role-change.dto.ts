import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

class RoleChangeParty {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class RoleChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: RoleChangeParty }) actor!: RoleChangeParty;
  @ApiProperty({ type: RoleChangeParty }) target!: RoleChangeParty;
  @ApiProperty({ enum: UserRole }) fromRole!: UserRole;
  @ApiProperty({ enum: UserRole }) toRole!: UserRole;
  @ApiProperty() createdAt!: Date;
}
