import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { getAssetsApi, type Asset } from '../api/assets.api';
import { getLocationsApi, type Location } from '../api/locations.api';
import { cancelStockTakeApi, completeStockTakeApi, createStockTakeApi, getStockTakesApi, type StockTake } from '../api/stockTakes.api';
import { DatePicker } from '@/components/common/DatePicker';
import { LocationTreeSelect } from '@/components/LocationTreeSelect';
import { useErrorToast } from '@/hooks/useErrorToast';
import { ErrorBox } from '@/components/common/ErrorBox';
import { Field } from '@/components/common/FilterCard';
import { PageHeader } from '@/components/common/PageHeader';
import { TableCard } from '@/components/common/TableCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const message = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || 'Stock Take request failed.';
const today = () => new Date().toISOString().slice(0, 10);
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Status drives the badge tone in both the list and the detail panel. */
function StatusBadge({ status }: { status: string }) {
  const variant = status === 'COMPLETED' ? 'default' : status === 'CANCELLED' ? 'outline' : 'secondary';
  return <Badge variant={variant} className="whitespace-nowrap">{label(status)}</Badge>;
}

export function StockTakesPages() {
  const [sessions, setSessions] = useState<StockTake[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<StockTake | null>(null);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ stockTakeDate: today(), pic: '', locationId: '' });
  const [preview, setPreview] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chosenLocation = useMemo(() => locations.find(item => String(item.id) === form.locationId), [form.locationId, locations]);

  useErrorToast(error);

  async function load() {
    setLoading(true); setError('');
    try { const [stockTakes, places] = await Promise.all([getStockTakesApi(), getLocationsApi()]); setSessions(stockTakes); setLocations(places.filter(place => place.isActive !== false)); }
    catch (reason) { setError(message(reason)); } finally { setLoading(false); }
  }
  useEffect(() => {
    // Existing admin pages use mount-time loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  async function preparePreview() {
    if (!form.locationId) return;
    setSaving(true); setError('');
    try { setPreview(await getAssetsApi({ locationId: Number(form.locationId) })); setStep(3); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }
  async function save() {
    setSaving(true); setError('');
    try { const created = await createStockTakeApi({ ...form, locationId: Number(form.locationId) }); setSessions(items => [created, ...items]); setSelected(created); setWizard(false); toast.success(`Stock Take ${created.stockTakeNo} created.`); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }
  async function transition(action: 'complete' | 'cancel') {
    if (!selected) return;
    setSaving(true); setError('');
    try { const next = action === 'complete' ? await completeStockTakeApi(selected.id) : await cancelStockTakeApi(selected.id); setSelected(next); setSessions(items => items.map(item => item.id === next.id ? next : item)); toast.success(action === 'complete' ? `Stock Take ${next.stockTakeNo} completed.` : `Stock Take ${next.stockTakeNo} cancelled.`); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }

  const steps = [
    { value: '1', label: '1  Detail' },
    { value: '2', label: '2  Location' },
    { value: '3', label: '3  Expected Assets' },
  ];

  return (
    <>
      <PageHeader
        title="Stock Takes"
        description="Location-based audit snapshots. Stock Take never reserves or mutates Assets."
        actions={
          <Button onClick={() => { setWizard(true); setStep(1); setPreview([]); setForm({ stockTakeDate: today(), pic: '', locationId: '' }); }}>
            <Plus />
            Add New Stock Take
          </Button>
        }
      />

      <ErrorBox message={error} />

      {wizard && (
        <Card>
          <CardHeader>
            <CardTitle>New Stock Take</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Steps are driven by the wizard's own guards, so triggers are display-only. */}
            <Tabs value={String(step)}>
              <TabsList>
                {steps.map(item => (
                  <TabsTrigger key={item.value} value={item.value} disabled>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Stock Take Code" htmlFor="stock-take-code">
                  <Input id="stock-take-code" value="Auto-generated on Save" disabled />
                </Field>
                <Field label="Date" htmlFor="stock-take-date">
                  <DatePicker
                    id="stock-take-date"
                    value={form.stockTakeDate}
                    clearable={false}
                    onChange={stockTakeDate => setForm({ ...form, stockTakeDate })}
                  />
                </Field>
                <Field label="PIC" htmlFor="stock-take-pic">
                  <Input id="stock-take-pic" value={form.pic} onChange={e => setForm({ ...form, pic: e.target.value })} />
                </Field>
                <Field label="Status" htmlFor="stock-take-status">
                  <Input id="stock-take-status" value="PENDING" disabled />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:max-w-md">
                <Field label="Location">
                  <LocationTreeSelect
                    locations={locations}
                    selectedLocationId={form.locationId}
                    onChange={locationId => setForm({ ...form, locationId: String(locationId) })}
                    placeholder="Select Location"
                  />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{chosenLocation?.name}</span> — {preview.length} Assets will be frozen in this expectation snapshot.
                </p>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Asset Code</TableHead>
                        <TableHead>Item / Category</TableHead>
                        <TableHead>EPC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                            No Assets are currently held at this Location.
                          </TableCell>
                        </TableRow>
                      ) : preview.map(asset => (
                        <TableRow key={asset.id}>
                          <TableCell className="font-mono text-xs">{asset.assetCode}</TableCell>
                          <TableCell>
                            <div className="font-medium">{asset.itemName}</div>
                            <div className="text-xs text-muted-foreground">{asset.category?.name || '-'}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{asset.epc?.epcCode || 'No EPC'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {step > 1 && <Button variant="outline" className="mr-auto" onClick={() => setStep(step - 1)}>Back</Button>}
              <Button variant="ghost" onClick={() => setWizard(false)}>Close</Button>
              {step === 1 && <Button disabled={!form.stockTakeDate || !form.pic.trim()} onClick={() => setStep(2)}>Next</Button>}
              {step === 2 && <Button disabled={!form.locationId || saving} onClick={preparePreview}>Load Expected Assets</Button>}
              {step === 3 && <Button disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Frozen Snapshot'}</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {selected.stockTakeNo}
                <StatusBadge status={selected.status} />
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {selected.location.name} ({selected.location.locationCode}) · PIC {selected.pic}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <X />
              Close Details
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(selected.summary).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-3">
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                  <div className="text-xs text-muted-foreground">{label(key)}</div>
                </div>
              ))}
            </div>

            {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => transition('complete')}>Complete</Button>
                <Button variant="destructive" disabled={saving} onClick={() => transition('cancel')}>Cancel</Button>
              </div>
            )}

            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Asset Code</TableHead>
                    <TableHead>Item / Category</TableHead>
                    <TableHead>EPC</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.expectedAssetCode}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.expectedItemName}</div>
                        <div className="text-xs text-muted-foreground">{item.expectedCategoryName}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.expectedEpc || 'No EPC'}</TableCell>
                      <TableCell>{label(item.result)}</TableCell>
                    </TableRow>
                  ))}
                  {selected.unexpected.map(scan => (
                    <TableRow key={`u-${scan.id}`}>
                      <TableCell>—</TableCell>
                      <TableCell className="text-muted-foreground">Unexpected scan</TableCell>
                      <TableCell className="font-mono text-xs">{scan.epc}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Unexpected</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <TableCard
        columns={['Stock Take', 'Date', 'Location', 'PIC', 'Status', 'Expected', 'Found', 'Missing', 'Unexpected', '']}
        loading={loading}
        isEmpty={sessions.length === 0}
        emptyMessage="No Stock Takes have been recorded yet."
        itemLabel="stock take"
      >
        {sessions.map(session => (
          <TableRow key={session.id}>
            <TableCell className="font-medium">{session.stockTakeNo}</TableCell>
            <TableCell className="whitespace-nowrap">{new Date(session.stockTakeDate).toLocaleDateString()}</TableCell>
            <TableCell>{session.location.name}</TableCell>
            <TableCell>{session.pic}</TableCell>
            <TableCell><StatusBadge status={session.status} /></TableCell>
            <TableCell className="tabular-nums">{session.summary.expected}</TableCell>
            <TableCell className="tabular-nums">{session.summary.found}</TableCell>
            <TableCell className="tabular-nums">{session.summary.missing}</TableCell>
            <TableCell className="tabular-nums">{session.summary.unexpected}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => setSelected(session)}>Details</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>
    </>
  );
}
