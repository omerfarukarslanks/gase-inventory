import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Attribute } from './entity/attribute.entity';
import { AttributeValue } from './entity/attribute-value.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';
import { RemoveAttributeDto } from './dto/remove-attribute.dto';
import { AppContextService } from 'src/common/context/app-context.service';
import { AttributeErrors } from 'src/common/errors/attribute.errors';
import {
  ListAttributesQueryDto,
  PaginatedAttributesResponse,
} from './dto/list-attributes.dto';

@Injectable()
export class AttributeService {
  constructor(
    @InjectRepository(Attribute)
    private readonly attributeRepo: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private readonly attributeValueRepo: Repository<AttributeValue>,
    private readonly appContext: AppContextService,
  ) {}

  private getAttributeRepo(manager?: EntityManager): Repository<Attribute> {
    return manager ? manager.getRepository(Attribute) : this.attributeRepo;
  }

  private getAttributeValueRepo(manager?: EntityManager): Repository<AttributeValue> {
    return manager ? manager.getRepository(AttributeValue) : this.attributeValueRepo;
  }

  private async getNextAttributeValue(tenantId: string, manager?: EntityManager): Promise<number> {
    const repo = this.getAttributeRepo(manager);
    const result = await repo
      .createQueryBuilder('attribute')
      .select('COALESCE(MAX(attribute.value), 0)', 'maxValue')
      .where('attribute.tenantId = :tenantId', { tenantId })
      .getRawOne<{ maxValue: number }>();

    return (result?.maxValue ?? 0) + 1;
  }

  private async getNextAttributeValueValue(
    attributeId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = this.getAttributeValueRepo(manager);
    const result = await repo
      .createQueryBuilder('av')
      .select('COALESCE(MAX(av.value), 0)', 'maxValue')
      .where('av.attributeId = :attributeId', { attributeId })
      .getRawOne<{ maxValue: number }>();

    return (result?.maxValue ?? 0) + 1;
  }

  async createAttribute(dto: CreateAttributeDto): Promise<Attribute> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const repo = this.getAttributeRepo();

    const existsByName = await repo.findOne({
      where: { tenant: { id: tenantId }, name: dto.name },
    });
    if (existsByName) {
      throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
    }

    const nextValue = await this.getNextAttributeValue(tenantId);

    const attribute = repo.create({
      name: dto.name,
      value: nextValue,
      tenant: { id: tenantId } as any,
      createdById: userId,
      updatedById: userId,
    });

    return repo.save(attribute);
  }

  async findAllAttributes(): Promise<Attribute[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    return this.attributeRepo.find({
      where: { tenant: { id: tenantId }, isActive: true },
      relations: ['values'],
      order: { name: 'ASC', values: { name: 'ASC' } },
    });
  }

  async findAllAttributesPaginated(
    query: ListAttributesQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedAttributesResponse> {
    const repo = this.getAttributeRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const { page, limit, skip, search, sortBy, sortOrder, isActive } = query;

    const qb = repo
      .createQueryBuilder('attribute')
      .where('attribute.tenantId = :tenantId', { tenantId });

    if (search) {
      qb.andWhere(
        '(attribute.name ILIKE :search OR CAST(attribute.value AS TEXT) ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined && isActive !== 'all') {
      qb.andWhere('attribute.isActive = :isActive', { isActive });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .select('attribute.id', 'id')
      .orderBy(`attribute.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany<{ id: string }>();

    const ids = rows.map((row) => row.id);

    if (ids.length === 0) {
      return {
        data: [],
        meta: {
          total,
          limit,
          page,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const data = await repo
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.values', 'values')
      .where('attribute.id IN (:...ids)', { ids })
      .orderBy(`attribute.${sortBy}`, sortOrder)
      .addOrderBy('values.name', 'ASC')
      .getMany();

    return {
      data,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAttribute(id: string): Promise<Attribute> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const attribute = await this.attributeRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['values'],
    });

    if (!attribute) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_NOT_FOUND);
    }

    return attribute;
  }

  private async findOneAttributeByNameOrThrow(
    name: string,
    manager?: EntityManager,
  ): Promise<Attribute> {
    const repo = this.getAttributeRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

    const attribute = await repo.findOne({
      where: { name, tenant: { id: tenantId } },
      relations: ['values'],
    });

    if (!attribute) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_NOT_FOUND);
    }

    return attribute;
  }

  private async findOneAttributeByValueOrThrow(
    value: number,
    manager?: EntityManager,
  ): Promise<Attribute> {
    const repo = this.getAttributeRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

    const attribute = await repo.findOne({
      where: { value, tenant: { id: tenantId } },
      relations: ['values'],
    });

    if (!attribute) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_NOT_FOUND);
    }

    return attribute;
  }

  async updateAttribute(id: string, dto: UpdateAttributeDto): Promise<Attribute> {
    const attribute = await this.findOneAttribute(id);
    const userId = this.appContext.getUserIdOrThrow();
    const tenantId = this.appContext.getTenantIdOrThrow();

    if (dto.name && dto.name !== attribute.name) {
      const existsByName = await this.attributeRepo.findOne({
        where: { tenant: { id: tenantId }, name: dto.name },
      });
      if (existsByName && existsByName.id !== attribute.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
      }
    }

    Object.assign(attribute, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedById: userId,
    });

    return this.attributeRepo.save(attribute);
  }

  async removeAttribute(dto: RemoveAttributeDto): Promise<void> {
    const attribute = await this.findOneAttributeByNameOrThrow(dto.name);
    const userId = this.appContext.getUserIdOrThrow();

    attribute.isActive = false;
    attribute.updatedById = userId;
    await this.attributeRepo.save(attribute);
  }

  async addValues(
    attributeValue: number,
    dtos: CreateAttributeValueDto[],
  ): Promise<AttributeValue[]> {
    const userId = this.appContext.getUserIdOrThrow();

    return this.attributeRepo.manager.transaction(async (manager) => {
      const attribute = await this.findOneAttributeByValueOrThrow(attributeValue, manager);
      const valueRepo = this.getAttributeValueRepo(manager);
      const created: AttributeValue[] = [];

      let nextValue = await this.getNextAttributeValueValue(attribute.id, manager);

      for (const dto of dtos) {
        const existsByName = await valueRepo.findOne({
          where: { attribute: { id: attribute.id }, name: dto.name },
        });
        if (existsByName) {
          throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
        }

        const item = valueRepo.create({
          name: dto.name,
          value: nextValue,
          attribute,
          createdById: userId,
          updatedById: userId,
        });

        created.push(await valueRepo.save(item));
        nextValue++;
      }

      return created;
    });
  }

  async updateValue(
    id: string,
    dto: UpdateAttributeValueDto,
  ): Promise<AttributeValue> {
    const repo = this.getAttributeValueRepo();
    const userId = this.appContext.getUserIdOrThrow();

    const item = await repo.findOne({
      where: { id },
      relations: ['attribute'],
    });

    if (!item) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_VALUE_NOT_FOUND);
    }

    if (dto.name && dto.name !== item.name) {
      const existsByName = await repo.findOne({
        where: { attribute: { id: item.attribute.id }, name: dto.name },
      });
      if (existsByName && existsByName.id !== item.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
      }
    }

    Object.assign(item, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedById: userId,
    });

    return repo.save(item);
  }

  async removeValue(
    attributeValue: number,
    dto: CreateAttributeValueDto,
  ): Promise<void> {
    const attribute = await this.findOneAttributeByValueOrThrow(attributeValue);
    const repo = this.getAttributeValueRepo();
    const userId = this.appContext.getUserIdOrThrow();

    const item = await repo.findOne({
      where: {
        attribute: { id: attribute.id },
        name: dto.name,
      },
    });

    if (!item) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_VALUE_NOT_FOUND);
    }

    item.isActive = false;
    item.updatedById = userId;
    await repo.save(item);
  }
}
