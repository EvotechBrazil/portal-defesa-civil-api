import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

class RoleChangeParty {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class RoleChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty() event!: string;
  @ApiProperty({ type: RoleChangeParty }) actor!: RoleChangeParty;
  @ApiProperty({ type: RoleChangeParty }) target!: RoleChangeParty;
  @ApiProperty({ enum: UserRole, nullable: true, required: false })
  fromRole!: UserRole | null;
  @ApiProperty({ enum: UserRole, nullable: true, required: false })
  toRole!: UserRole | null;
  @ApiProperty() createdAt!: Date;
}
