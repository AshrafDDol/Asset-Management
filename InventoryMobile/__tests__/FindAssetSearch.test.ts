const mockGet = jest.fn();

jest.mock('../src/api/client', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  unwrap: (response: { data: { data: unknown } }) => response.data.data,
}));

import { searchFindAssets } from '../src/api/assets';

const asset = (id: number, status = 'ACTIVE', active = true) => ({
  id,
  assetCode: `A-${id}`,
  itemName: `Asset ${id}`,
  epc: { epcCode: `EPC${id}`, status, isActive: active },
});

describe('Find Asset search', () => {
  beforeEach(() => mockGet.mockReset());

  it('does not make an unfiltered request', async () => {
    await expect(searchFindAssets('   ')).resolves.toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('runs separate filters, merges duplicates, and excludes inactive EPCs', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [asset(1), asset(2, 'INACTIVE')] } })
      .mockResolvedValueOnce({ data: { data: [asset(1), asset(3)] } })
      .mockResolvedValueOnce({ data: { data: [asset(3), asset(4, 'ACTIVE', false)] } });

    await expect(searchFindAssets('pump')).resolves.toEqual([asset(1), asset(3)]);
    expect(mockGet.mock.calls.map(call => call[1].params)).toEqual([
      { assetCode: 'pump' },
      { itemName: 'pump' },
      { epc: 'pump' },
    ]);
  });
});
