import { ProductPackage } from '../product-package.entity';

export class PackageVariantResponse {
  id: string;
  createdAt: Date;
  createdById?: string;
  updatedAt: Date;
  updatedById?: string;
  name: string;
  code: string;
  isActive: boolean;
}

export class PackageItemResponse {
  id: string;
  createdAt: Date;
  createdById?: string;
  updatedAt: Date;
  updatedById?: string;
  productId?: string;
  stock?: number;
  quantity: number;
  productVariant: PackageVariantResponse;
}

export class PackageResponse {
  id: string;
  createdAt: Date;
  createdById?: string;
  updatedAt: Date;
  updatedById?: string;
  name: string;
  code?: string;
  description?: string;
  defaultSalePrice?: number | null;
  defaultPurchasePrice?: number | null;
  defaultTaxPercent?: number | null;
  defaultDiscountPercent?: number | null;
  defaultDiscountAmount?: number | null;
  defaultTaxAmount?: number | null;
  defaultLineTotal?: number | null;
  defaultCurrency: string;
  isActive: boolean;
  items: PackageItemResponse[];

  static fromEntity(pkg: ProductPackage): PackageResponse {
    const res = new PackageResponse();
    res.id = pkg.id;
    res.createdAt = pkg.createdAt;
    res.createdById = pkg.createdById;
    res.updatedAt = pkg.updatedAt;
    res.updatedById = pkg.updatedById;
    res.name = pkg.name;
    res.code = pkg.code;
    res.description = pkg.description;
    res.defaultSalePrice = pkg.defaultSalePrice;
    res.defaultPurchasePrice = pkg.defaultPurchasePrice;
    res.defaultTaxPercent = pkg.defaultTaxPercent;
    res.defaultDiscountPercent = pkg.defaultDiscountPercent;
    res.defaultDiscountAmount = pkg.defaultDiscountAmount;
    res.defaultTaxAmount = pkg.defaultTaxAmount;
    res.defaultLineTotal = pkg.defaultLineTotal;
    res.defaultCurrency = pkg.defaultCurrency;
    res.isActive = pkg.isActive;
    res.items = (pkg.items ?? []).map((item) => {
      const i = new PackageItemResponse();
      i.id = item.id;
      i.createdAt = item.createdAt;
      i.createdById = item.createdById;
      i.updatedAt = item.updatedAt;
      i.updatedById = item.updatedById;
      i.productId = item.product?.id ?? item.productId;
      i.stock = (item as any).stock;
      i.quantity = item.quantity;
      const v = new PackageVariantResponse();
      v.id = item.productVariant.id;
      v.createdAt = item.productVariant.createdAt;
      v.createdById = item.productVariant.createdById;
      v.updatedAt = item.productVariant.updatedAt;
      v.updatedById = item.productVariant.updatedById;
      v.name = item.productVariant.name;
      v.code = item.productVariant.code;
      v.isActive = item.productVariant.isActive;
      i.productVariant = v;
      return i;
    });
    return res;
  }
}
