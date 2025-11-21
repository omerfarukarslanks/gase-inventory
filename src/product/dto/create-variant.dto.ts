import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateVariantDto {
  @ApiProperty({ example: 'Kırmızı / L' })
  name: string;

  @ApiProperty({ example: 'RED-L', description: 'Varyant kodu' })
  code: string;

  @ApiPropertyOptional({ example: '8691234567890' })
  barcode?: string;

  @ApiPropertyOptional({
    example: { color: 'Red', size: 'L' },
    description: 'Serbest biçimli attribute bilgileri (renk, beden vb.)',
  })
  attributes?: Record<string, any>;
}
