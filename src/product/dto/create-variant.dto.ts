import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateVariantDto {
  @ApiProperty({ example: 'Kırmızı / L' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'RED-L', description: 'Varyant kodu' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: '8691234567890' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({
    example: { color: 'Red', size: 'L' },
    description: 'Serbest biçimli attribute bilgileri (renk, beden vb.)',
  })
  @IsOptional()
  attributes?: Record<string, any>;
}
