import type { Asset } from "../api/assets.api";
import { displayValue, formatBladeDetails, formatGap, formatMeasurement, formatPurchaseDate, formatRadius } from "../utils/assetDisplay";
import { locationDisplayName } from "../utils/locationDisplay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const DetailField = ({ label, value }: { label: string; value: unknown }) => (
  <div className="space-y-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium break-words">{displayValue(value)}</div>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h4 className="text-sm font-semibold">{title}</h4>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </section>
);

export function AssetDetailsModal({ asset, close }: { asset: Asset | null; close: () => void }) {
  return (
    <Dialog open={!!asset} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {asset && (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4">
              <DialogTitle>Asset Details</DialogTitle>
              <DialogDescription>{asset.assetCode} · Read-only master information</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <Section title="Basic Information">
                <DetailField label="Asset Code" value={asset.assetCode} />
                <DetailField label="Item Name" value={asset.itemName} />
                <DetailField label="Category" value={asset.category?.name} />
              </Section>

              <Separator />

              <Section title="Measurement & Blade Details">
                <DetailField label="Measurement" value={formatMeasurement(asset)} />
                <DetailField label="Blade Details" value={formatBladeDetails(asset)} />
                <DetailField label="Grid / Up" value={asset.gridUp == null ? null : `${asset.gridUp} UP`} />
                <DetailField label="Radius" value={formatRadius(asset.radius)} />
                <DetailField label="Gap" value={formatGap(asset.gapMm)} />
              </Section>

              <Separator />

              <Section title="Location">
                <DetailField label="Current Location" value={locationDisplayName(asset.location)} />
                <DetailField label="Storage Location" value={locationDisplayName(asset.homeLocation)} />
              </Section>

              <Separator />

              <Section title="Identification">
                <DetailField label="EPC" value={asset.epc?.epcCode} />
                <DetailField label="Brand" value={asset.brand} />
                <DetailField label="Model" value={asset.model} />
                <DetailField label="Serial Number" value={asset.serialNumber} />
              </Section>

              <Separator />

              <Section title="Purchase & Condition">
                <DetailField label="Purchase Date" value={formatPurchaseDate(asset.purchaseDate)} />
                <DetailField label="Purchase Cost" value={asset.purchaseCost} />
                <DetailField label="Condition" value={asset.condition} />
                <DetailField label="Remarks" value={asset.remarks} />
              </Section>

              <Separator />

              <Section title="System">
                <DetailField label="Status" value={asset.status} />
                <DetailField label="Active" value={asset.isActive === false ? "No" : "Yes"} />
                <DetailField label="Created At" value={asset.createdAt ? new Date(asset.createdAt).toLocaleString() : null} />
                <DetailField label="Updated At" value={asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : null} />
              </Section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
