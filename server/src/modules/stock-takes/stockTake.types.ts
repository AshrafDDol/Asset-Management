export type CreateStockTakeInput = {
  locationId: number;
  stockTakeDate: string;
  pic: string;
};

export type RecordStockTakeScansInput = { epcs: string[] };
