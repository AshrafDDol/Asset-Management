import { useEffect, useMemo, useState } from 'react';
import { getAssetsApi, type Asset } from '../api/assets.api';
import { getLocationsApi, type Location } from '../api/locations.api';
import { cancelStockTakeApi, completeStockTakeApi, createStockTakeApi, getStockTakesApi, type StockTake } from '../api/stockTakes.api';

const message = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || 'Stock Take request failed.';
const today = () => new Date().toISOString().slice(0, 10);
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

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
    try { const created = await createStockTakeApi({ ...form, locationId: Number(form.locationId) }); setSessions(items => [created, ...items]); setSelected(created); setWizard(false); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }
  async function transition(action: 'complete' | 'cancel') {
    if (!selected) return;
    setSaving(true); setError('');
    try { const next = action === 'complete' ? await completeStockTakeApi(selected.id) : await cancelStockTakeApi(selected.id); setSelected(next); setSessions(items => items.map(item => item.id === next.id ? next : item)); }
    catch (reason) { setError(message(reason)); } finally { setSaving(false); }
  }

  return <div className="page">
    <div className="page-title-row"><div><h2>Stock Takes</h2><p>Location-based audit snapshots. Stock Take never reserves or mutates Assets.</p></div><button className="primary-button" onClick={() => { setWizard(true); setStep(1); setPreview([]); setForm({ stockTakeDate: today(), pic: '', locationId: '' }); }}>Add New Stock Take</button></div>
    {error && <div className="error-box">{error}</div>}
    {wizard && <div className="form-panel stock-take-wizard">
      <div className="issue-tabs"><button className={step === 1 ? 'active' : ''}>1 Detail</button><button className={step === 2 ? 'active' : ''}>2 Location</button><button className={step === 3 ? 'active' : ''}>3 Expected Assets</button></div>
      {step === 1 && <div className="form-grid"><label className="form-field">Stock Take Code<input value="Auto-generated on Save" disabled /></label><label className="form-field">Date<input type="date" value={form.stockTakeDate} onChange={e => setForm({ ...form, stockTakeDate: e.target.value })} /></label><label className="form-field">PIC<input value={form.pic} onChange={e => setForm({ ...form, pic: e.target.value })} /></label><label className="form-field">Status<input value="PENDING" disabled /></label></div>}
      {step === 2 && <div className="form-grid"><label className="form-field">IMS Location<select value={form.locationId} onChange={e => setForm({ ...form, locationId: e.target.value })}><option value="">Select Location</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name} ({location.locationCode})</option>)}</select></label></div>}
      {step === 3 && <><p><strong>{chosenLocation?.name}</strong> — {preview.length} Assets will be frozen in this expectation snapshot.</p><div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset Code</th><th>Item / Category</th><th>EPC</th></tr></thead><tbody>{preview.map(asset => <tr key={asset.id}><td>{asset.assetCode}</td><td>{asset.itemName}<small>{asset.category?.name || '-'}</small></td><td>{asset.epc?.epcCode || 'No EPC'}</td></tr>)}</tbody></table></div></>}
      <div className="form-actions">{step > 1 && <button className="secondary-button" onClick={() => setStep(step - 1)}>Back</button>}{step === 1 && <button className="primary-button" disabled={!form.stockTakeDate || !form.pic.trim()} onClick={() => setStep(2)}>Next</button>}{step === 2 && <button className="primary-button" disabled={!form.locationId || saving} onClick={preparePreview}>Load Expected Assets</button>}{step === 3 && <button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Frozen Snapshot'}</button>}<button className="secondary-button" onClick={() => setWizard(false)}>Close</button></div>
    </div>}
    {selected && <div className="form-panel"><div className="page-title-row"><div><h3>{selected.stockTakeNo}</h3><p>{selected.location.name} ({selected.location.locationCode}) · PIC {selected.pic} · {label(selected.status)}</p></div><button className="secondary-button" onClick={() => setSelected(null)}>Close Details</button></div>
      <div className="stock-take-summary">{Object.entries(selected.summary).map(([key, value]) => <article key={key}><strong>{value}</strong><span>{label(key)}</span></article>)}</div>
      {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && <div className="form-actions"><button className="primary-button" disabled={saving} onClick={() => transition('complete')}>Complete</button><button className="danger-button" disabled={saving} onClick={() => transition('cancel')}>Cancel</button></div>}
      <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset Code</th><th>Item / Category</th><th>EPC</th><th>Result</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.id}><td>{item.expectedAssetCode}</td><td>{item.expectedItemName}<small>{item.expectedCategoryName}</small></td><td>{item.expectedEpc || 'No EPC'}</td><td>{label(item.result)}</td></tr>)}{selected.unexpected.map(scan => <tr key={`u-${scan.id}`}><td>—</td><td>Unexpected scan</td><td>{scan.epc}</td><td>Unexpected</td></tr>)}</tbody></table></div>
    </div>}
    <div className="table-panel">{loading ? <p>Loading Stock Takes...</p> : <table className="data-table"><thead><tr><th>Stock Take</th><th>Date</th><th>Location</th><th>PIC</th><th>Status</th><th>Expected</th><th>Found</th><th>Missing</th><th>Unexpected</th><th></th></tr></thead><tbody>{sessions.map(session => <tr key={session.id}><td>{session.stockTakeNo}</td><td>{new Date(session.stockTakeDate).toLocaleDateString()}</td><td>{session.location.name}</td><td>{session.pic}</td><td>{label(session.status)}</td><td>{session.summary.expected}</td><td>{session.summary.found}</td><td>{session.summary.missing}</td><td>{session.summary.unexpected}</td><td><button className="table-button" onClick={() => setSelected(session)}>Details</button></td></tr>)}</tbody></table>}</div>
  </div>;
}
