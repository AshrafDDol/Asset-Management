const mockStorage = new Map<string, string>();
const mockRecordStockTakeScans = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
}));

jest.mock('../src/api/stockTakes', () => ({
  recordStockTakeScans: (...args: unknown[]) => mockRecordStockTakeScans(...args),
}));

const response = {
  id: 1,
  stockTakeNo: 'ST-TEST',
  stockTakeDate: '2026-10-09',
  pic: 'Tester',
  status: 'IN_PROGRESS',
  location: { id: 1, locationCode: 'LOC', name: 'Location' },
  items: [],
  unexpected: [],
  summary: { expected: 0, found: 0, missing: 0, unexpected: 0 },
};

describe('StockTakeSyncService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockStorage.clear();
    mockRecordStockTakeScans.mockReset();
    mockRecordStockTakeScans.mockResolvedValue(response);
  });

  afterEach(() => jest.useRealTimers());

  it('deduplicates callbacks and submits bounded batches sequentially', async () => {
    const service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(1);
    const epcs = Array.from({ length: 45 }, (_, index) => `epc-${index}`);
    await service.enqueue(1, [...epcs, 'EPC-0']);
    await service.synchronizeNow(1);

    expect(mockRecordStockTakeScans).toHaveBeenCalledTimes(2);
    expect(mockRecordStockTakeScans.mock.calls[0][1]).toHaveLength(40);
    expect(mockRecordStockTakeScans.mock.calls[1][1]).toHaveLength(5);
    expect(service.getPendingEpcs(1)).toEqual([]);
  });

  it('retains failed scans durably and retries without changing session', async () => {
    mockRecordStockTakeScans.mockRejectedValueOnce(new Error('offline'));
    const service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(7);
    await service.enqueue(7, [' abc ']);

    await expect(service.synchronizeNow(7)).rejects.toThrow('offline');
    expect(service.getPendingEpcs(7)).toEqual(['ABC']);
    expect(mockStorage.get('ims.stockTake.pendingScans.v1')).toContain('ABC');

    await service.synchronizeNow(7);
    expect(mockRecordStockTakeScans.mock.calls[1][0]).toBe(7);
    expect(service.getPendingEpcs(7)).toEqual([]);
  });

  it('keeps pending EPCs isolated by Stock Take session', async () => {
    const service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(10);
    await service.initialize(11);
    await service.enqueue(10, ['SESSION-10']);
    await service.enqueue(11, ['SESSION-11']);

    expect(service.getPendingEpcs(10)).toEqual(['SESSION-10']);
    expect(service.getPendingEpcs(11)).toEqual(['SESSION-11']);
  });

  it('handles 500 EPCs with bounded batches', async () => {
    const service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(20);
    await service.enqueue(20, Array.from({ length: 500 }, (_, index) => `TAG-${index}`));
    await service.synchronizeNow(20);

    expect(mockRecordStockTakeScans).toHaveBeenCalledTimes(13);
    expect(mockRecordStockTakeScans.mock.calls.every(call => call[1].length <= 40)).toBe(true);
  });

  it('rehydrates pending scans after the service is recreated', async () => {
    let service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(30);
    await service.enqueue(30, ['DURABLE-EPC']);

    jest.resetModules();
    service = require('../src/services/stockTake/StockTakeSyncService').default;
    await service.initialize(30);
    expect(service.getPendingEpcs(30)).toEqual(['DURABLE-EPC']);
  });
});
