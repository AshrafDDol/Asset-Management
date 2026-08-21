import { useAssetCategoriesPagesFunction } from './functionPages/AssetCategoriesPagesFunction';

export function AssetCategoriesPages() {
  const {
    error,
    form,
    saving,
    loading,
    assetCategories,

    updateForm,
    loadAssetCategories,
    handleCreateAssetCategory,
  } = useAssetCategoriesPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Asset Categories</h2>
          <p>Manage asset categories for inventory management</p>
        </div>

        <button  className="secondary-button" onClick={loadAssetCategories}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleCreateAssetCategory}>
        <div className="form-grid">
          <div className="form-field">
            <label>Category Code</label>
            <input
              value={form.categoryCode}
              onChange={(event) =>
                updateForm("categoryCode", event.target.value)
              }
              placeholder="Enter category code"
            />
          </div>

          <div className="form-field">
            <label>Category Name</label>
            <input
              value={form.name}
              onChange={(event) =>
                updateForm("name", event.target.value)
              }
              placeholder="Enter category name"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Enter category description"
            />
          </div>
        </div>

        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Saving..." : "Create Asset Category"}
        </button>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category Code</th>
                <th>Category Name</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {assetCategories.length === 0 ? (
                <tr>
                  <td colSpan={5}>No asset categories available</td>
                </tr>
              ) : (
                assetCategories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.id}</td>
                    <td>{category.categoryCode}</td>
                    <td>{category.name}</td>
                    <td>{category.description || "-"}</td>
                    <td>{category.isActive === false ? "Inactive" : "Active"}</td>
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
