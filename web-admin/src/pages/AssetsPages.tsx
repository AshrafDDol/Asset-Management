import { useAssetsPagesFunction } from './functionPages/AssetsPagesFunction';

export function AssetsPages() {
  const {
    assets,
    assetCategories,
    departments,
    locations,
    form,
    loading,
    saving,
    error,
    isEditing,
    updateForm,
    loadPageData,
    handleEditAsset,
    handleCancelEdit,
    handleSubmitAsset,
  } = useAssetsPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Assets</h2>
          <p>Manage company asset master records.</p>
        </div>

        <button className="secondary-button" onClick={loadPageData}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleSubmitAsset}>
        <div className="form-grid">
          <div className="form-field">
            <label>Asset Code</label>
            <input
              value={form.assetCode}
              onChange={(event) => updateForm("assetCode", event.target.value)}
              placeholder="Example: AST-0001"
            />
          </div>

          <div className="form-field">
            <label>Item Name</label>
            <input
              value={form.itemName}
              onChange={(event) => updateForm("itemName", event.target.value)}
              placeholder="Example: Dell Laptop"
            />
          </div>

          <div className="form-field">
            <label>Category</label>
            <select
              value={form.categoryId}
              onChange={(event) => updateForm("categoryId", event.target.value)}
            >
              <option value="">Select category</option>
              {assetCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Department</label>
            <select
              value={form.departmentId}
              onChange={(event) =>
                updateForm("departmentId", event.target.value)
              }
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Location</label>
            <select
              value={form.locationId}
              onChange={(event) => updateForm("locationId", event.target.value)}
            >
              <option value="">No location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Serial Number</label>
            <input
              value={form.serialNumber}
              onChange={(event) =>
                updateForm("serialNumber", event.target.value)
              }
              placeholder="Optional"
            />
          </div>

          <div className="form-field">
            <label>Brand</label>
            <input
              value={form.brand}
              onChange={(event) => updateForm("brand", event.target.value)}
              placeholder="Example: Dell"
            />
          </div>

          <div className="form-field">
            <label>Model</label>
            <input
              value={form.model}
              onChange={(event) => updateForm("model", event.target.value)}
              placeholder="Example: Latitude 5440"
            />
          </div>

          <div className="form-field">
            <label>Purchase Date</label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(event) =>
                updateForm("purchaseDate", event.target.value)
              }
            />
          </div>

          <div className="form-field">
            <label>Purchase Cost</label>
            <input
              type="number"
              value={form.purchaseCost}
              onChange={(event) =>
                updateForm("purchaseCost", event.target.value)
              }
              placeholder="Example: 3500"
            />
          </div>

          <div className="form-field">
            <label>Status</label>
            <input
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              placeholder="Example: AVAILABLE"
            />
          </div>

          <div className="form-field">
            <label>Condition</label>
            <input
              value={form.condition}
              onChange={(event) => updateForm("condition", event.target.value)}
              placeholder="Example: GOOD"
            />
          </div>

          <div className="form-field">
            <label>Remarks</label>
            <input
              value={form.remarks}
              onChange={(event) => updateForm("remarks", event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="form-field checkbox-field">
            <label>Status Active</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateForm("isActive", event.target.checked)
                }
              />
              Active
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button className="primary-button" disabled={saving} type="submit">
            {saving
              ? "Saving..."
              : isEditing
              ? "Update Asset"
              : "Create Asset"}
          </button>

          {isEditing && (
            <button
              className="secondary-button"
              type="button"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading assets...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Asset Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Department</th>
                <th>Location</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={10}>No assets found.</td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.id}</td>
                    <td>{asset.assetCode}</td>
                    <td>{asset.itemName}</td>
                    <td>{asset.category?.name || asset.categoryId}</td>
                    <td>{asset.department?.name || "-"}</td>
                    <td>{asset.location?.name || "-"}</td>
                    <td>{asset.status || "-"}</td>
                    <td>{asset.condition || "-"}</td>
                    <td>{asset.isActive === false ? "Inactive" : "Active"}</td>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        onClick={() => handleEditAsset(asset)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}