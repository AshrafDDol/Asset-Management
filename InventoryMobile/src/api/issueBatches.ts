import { api, unwrap } from './client';

export type IssuePerson = {
  id: number;
  username: string;
  fullName: string;
};

export type IssueLocation = {
  id: number;
  locationCode: string;
  name: string;
};

export type PendingIssue = {
  id: number;
  batchNo: string;
  jobNo?: string | null;
  status: string;
  recipient?: IssuePerson | null;
  toLocation?: IssueLocation | null;
  expectedAssetCount: number;
  confirmedAssetCount: number;
  createdAt: string;
};

export type ExpectedIssueAsset = {
  itemId: number;
  assetId: number;
  assignmentId: number | null;
  assetCode: string;
  itemName: string;
  epc?: string | null;
  status: string;
  category?: { id: number; name: string; categoryCode?: string } | null;
  currentLocation?: IssueLocation | null;
  homeLocation?: IssueLocation | null;
  recipient?: IssuePerson | null;
  toLocation?: IssueLocation | null;
};

export type HandheldIssue = {
  id: number;
  batchNo: string;
  jobNo?: string | null;
  status: string;
  recipient?: IssuePerson | null;
  toLocation?: IssueLocation | null;
  expectedAssetCount: number;
  expectedItems: ExpectedIssueAsset[];
};

export type HandheldConfirmation = {
  success: true;
  status: 'CONFIRMED' | 'ALREADY_CONFIRMED';
  alreadyConfirmed: boolean;
  issueId: number;
  message: string;
  confirmedAssetCount: number;
};

export async function getPendingIssues() {
  return unwrap<PendingIssue[]>(await api.get('/issue-batches/handheld/pending'));
}

export async function getHandheldIssue(id: number) {
  return unwrap<HandheldIssue>(await api.get(`/issue-batches/${id}/handheld`));
}

export async function confirmHandheldIssue(
  id: number,
  matched: Array<{
    itemId: number;
    assetId: number;
    assignmentId: number;
    epc: string;
  }>,
  unexpectedEpcs: string[],
) {
  return unwrap<HandheldConfirmation>(
    await api.post(`/issue-batches/${id}/handheld-confirm`, {
      issueBatchId: id,
      matched,
      unexpectedEpcs,
    }),
  );
}
