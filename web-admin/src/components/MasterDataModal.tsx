import type { ReactNode } from "react";

type MasterDataModalProps = {
  title: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MasterDataModal({ title, description, busy, onClose, children }: MasterDataModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="master-data-modal" role="dialog" aria-modal="true" aria-labelledby="master-data-modal-title">
        <div className="page-title-row">
          <div>
            <h3 id="master-data-modal-title">{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Close</button>
        </div>
        {children}
      </section>
    </div>
  );
}

type ConfirmDeleteDialogProps = {
  title: string;
  recordLabel: string;
  actionLabel?: string;
  message?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({ title, recordLabel, actionLabel = "Delete", message = "This action cannot be undone. Records with operational references will be protected.", busy, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <div className="modal-backdrop modal-backdrop-confirm" role="presentation">
      <section className="confirm-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">
        <h3 id="confirm-delete-title">{title}</h3>
        <p>{recordLabel}</p>
        <p>{message}</p>
        <div className="form-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Working..." : actionLabel}</button>
        </div>
      </section>
    </div>
  );
}
