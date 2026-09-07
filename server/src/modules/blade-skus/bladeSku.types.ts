export type BladeSkuFilters = {
  active?: boolean;
  search?: string;
  categoryId?: number;
};

export type CreateBladeSkuInput = {
  skuCode: string;
  name: string;
  categoryId: number;
  bladeType?: string;
  specification?: string;
  remarks?: string;
};

export type UpdateBladeSkuInput = Partial<CreateBladeSkuInput> & {
  isActive?: boolean;
};
