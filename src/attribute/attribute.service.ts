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

    const existsByValue = await repo.findOne({
      where: { tenant: { id: tenantId }, value: dto.value },
    });
    if (existsByValue) {
      throw new BadRequestException(AttributeErrors.ATTRIBUTE_VALUE_EXISTS);
    }

    const attribute = repo.create({
      name: dto.name,
      value: dto.value,
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

  async updateAttribute(dto: UpdateAttributeDto): Promise<Attribute> {
    const attribute = await this.findOneAttributeByNameOrThrow(dto.currentName);
    const userId = this.appContext.getUserIdOrThrow();
    const tenantId = this.appContext.getTenantIdOrThrow();

    if (dto.currentValue !== undefined && dto.currentValue !== attribute.value) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_NOT_FOUND);
    }

    if (dto.name && dto.name !== attribute.name) {
      const existsByName = await this.attributeRepo.findOne({
        where: { tenant: { id: tenantId }, name: dto.name },
      });
      if (existsByName && existsByName.id !== attribute.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
      }
    }

    if (dto.value !== undefined && dto.value !== attribute.value) {
      const existsByValue = await this.attributeRepo.findOne({
        where: { tenant: { id: tenantId }, value: dto.value },
      });
      if (existsByValue && existsByValue.id !== attribute.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_VALUE_EXISTS);
      }
    }

    Object.assign(attribute, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedById: userId,
    });

    return this.attributeRepo.save(attribute);
  }

  async removeAttribute(dto: RemoveAttributeDto): Promise<void> {
    const attribute = await this.findOneAttributeByNameOrThrow(dto.name);
    const userId = this.appContext.getUserIdOrThrow();

    if (dto.value !== undefined && dto.value !== attribute.value) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_NOT_FOUND);
    }

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

      for (const dto of dtos) {
        const existsByName = await valueRepo.findOne({
          where: { attribute: { id: attribute.id }, name: dto.name },
        });
        if (existsByName) {
          throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
        }

        const existsByValue = await valueRepo.findOne({
          where: { attribute: { id: attribute.id }, value: dto.value },
        });
        if (existsByValue) {
          throw new BadRequestException(AttributeErrors.ATTRIBUTE_VALUE_EXISTS);
        }

        const item = valueRepo.create({
          name: dto.name,
          value: dto.value,
          attribute,
          createdById: userId,
          updatedById: userId,
        });

        created.push(await valueRepo.save(item));
      }

      return created;
    });
  }

  async updateValue(
    attributeValue: number,
    dto: UpdateAttributeValueDto,
  ): Promise<AttributeValue> {
    const attribute = await this.findOneAttributeByValueOrThrow(attributeValue);
    const repo = this.getAttributeValueRepo();
    const userId = this.appContext.getUserIdOrThrow();

    const item = await repo.findOne({
      where: {
        attribute: { id: attribute.id },
        name: dto.currentName,
        value: dto.currentValue,
      },
    });

    if (!item) {
      throw new NotFoundException(AttributeErrors.ATTRIBUTE_VALUE_NOT_FOUND);
    }

    if (dto.name && dto.name !== item.name) {
      const existsByName = await repo.findOne({
        where: { attribute: { id: attribute.id }, name: dto.name },
      });
      if (existsByName && existsByName.id !== item.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_NAME_EXISTS);
      }
    }

    if (dto.value !== undefined && dto.value !== item.value) {
      const existsByValue = await repo.findOne({
        where: { attribute: { id: attribute.id }, value: dto.value },
      });
      if (existsByValue && existsByValue.id !== item.id) {
        throw new BadRequestException(AttributeErrors.ATTRIBUTE_VALUE_EXISTS);
      }
    }

    Object.assign(item, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
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
        value: dto.value,
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
