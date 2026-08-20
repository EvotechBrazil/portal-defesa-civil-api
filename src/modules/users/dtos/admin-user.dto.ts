import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Projecao de usuario para as telas administrativas. Nunca expoe
 * passwordHash, photoBytes, whatsapp nem tenantId.
 */
export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiPropertyOptional({ nullable: true }) manada!: string | null;
  @ApiPropertyOptional({ nullable: true }) lgndNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
