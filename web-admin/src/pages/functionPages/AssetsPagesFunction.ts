import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { getAssetsApi, createAssetApi, updateAssetApi, deleteAssetApi, type Asset } from '../../api/assets.api';
import { getAssetCategoriesApi, type AssetCategory } from '../../api/assetCategories.api';
import { type Location, getLocationsApi } from '../../api/locations.api';

type AssetFormState = {
    assetCode: string;
    itemName: string;
    categoryId: string;
    measurementHeight: string;
    measurementWidth: string;
    epcCode: string;
    autoGenerateEpc: boolean;
    locationId: string;
    homeLocationId: string;
    serialNumber: string;
    brand: string;
    model: string;
    purchaseDate: string;
    purchaseCost: string;
    condition: string;
    remarks: string;
    isActive: boolean;
};

const initialForm: AssetFormState = {
    assetCode: "",
    itemName: "",
    categoryId: "",
    measurementHeight: "",
    measurementWidth: "",
    epcCode: "",
    autoGenerateEpc: true,
    locationId: "",
    homeLocationId: "",
    serialNumber: "",
    brand: "",
    model: "",
    purchaseDate: "",
    purchaseCost: "",
    condition: "",
    remarks: "",
    isActive: true,
};

function errorMessage(error: unknown, fallback: string) {
    const value = error as { response?: { data?: { message?: string } }; message?: string };
    return value.response?.data?.message || value.message || fallback;
}

function validateForm(form: AssetFormState, isEditing: boolean): string | null {
    if (!form.assetCode.trim()) {
        return "Asset code is required.";
    }

    if (!form.itemName.trim()) return "Item name is required.";
    if (!form.categoryId) return "Asset Category is required.";
    if (!isEditing && !form.locationId) return "Location is required.";

    return null;
}

function buildCreatePayload(form: AssetFormState) {
    return {
        assetCode: form.assetCode.trim(),
        itemName: form.itemName.trim(),
        categoryId: Number(form.categoryId),
        measurementHeight: form.measurementHeight ? Number(form.measurementHeight) : null,
        measurementWidth: form.measurementWidth ? Number(form.measurementWidth) : null,
        epcCode: form.autoGenerateEpc ? undefined : form.epcCode.trim() || undefined,
        autoGenerateEpc: form.autoGenerateEpc,
        locationId: Number(form.locationId),
        serialNumber: form.serialNumber.trim() || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        purchaseDate: form.purchaseDate || undefined,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        condition: form.condition.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
    };
}

function buildUpdatePayload(form: AssetFormState, includeLocation: boolean, initializeHome: boolean) {
    const payload = buildCreatePayload(form);
    return {
        ...payload,
        locationId: includeLocation && form.locationId ? Number(form.locationId) : undefined,
        homeLocationId: initializeHome && form.homeLocationId ? Number(form.homeLocationId) : undefined,
        epcCode: undefined,
        autoGenerateEpc: undefined,
        isActive: form.isActive,
    };
}

export function useAssetsPagesFunction() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [form, setForm] = useState<AssetFormState>(initialForm);

    const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [createdEpc, setCreatedEpc] = useState("");

    const isEditing = editingAssetId !== null;
    const locationLocked = isEditing && assets.find((asset) => asset.id === editingAssetId)?.status !== "AVAILABLE";
    const homeNeedsVerification = !!isEditing && assets.find((asset) => asset.id === editingAssetId)?.homeLocationId == null;

    function updateForm<K extends keyof AssetFormState>(
        key: K,
        value: AssetFormState[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    async function loadAssets() {
        const data = await getAssetsApi();
        setAssets(Array.isArray(data) ? data : []);
    }

    async function loadPageData() {
        try {
            setLoading(true);
            setError("");

            const [assetData, categoryData, locationData] =
                await Promise.all([
                    getAssetsApi(),
                    getAssetCategoriesApi(),
                    getLocationsApi(),
                ]);
            
            setAssets(Array.isArray(assetData) ? assetData : []);
            setAssetCategories(Array.isArray(categoryData) ? categoryData : []);
            setLocations(Array.isArray(locationData) ? locationData : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load data. Please try again."));
        } finally {
            setLoading(false);
        }
    }

    function handleEditAsset(asset: Asset) {
        setEditingAssetId(asset.id);

        setForm({
            assetCode: asset.assetCode || "",
            itemName: asset.itemName || "",
            categoryId: String(asset.categoryId),
            measurementHeight: asset.measurementHeight == null ? "" : String(asset.measurementHeight),
            measurementWidth: asset.measurementWidth == null ? "" : String(asset.measurementWidth),
            epcCode: "",
            autoGenerateEpc: true,
            locationId: asset.locationId ? String(asset.locationId) : "",
            homeLocationId: asset.homeLocationId ? String(asset.homeLocationId) : "",
            serialNumber: asset.serialNumber || "",
            brand: asset.brand || "",
            model: asset.model || "",
            purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
            purchaseCost:
                asset.purchaseCost !== null && asset.purchaseCost !== undefined
                ? String(asset.purchaseCost)
                : "",
            condition: asset.condition || "",
            remarks: asset.remarks || "",
            isActive: asset.isActive !== false,
        });
    }

    function handleCancelEdit() {
        setEditingAssetId(null);
        setForm(initialForm);
        setError("");
    }

    async function handleSubmitAsset(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form, isEditing);

        if (validationError) {
            setError(validationError);
            return false;
        }

        try {
            setSaving(true);
            setError("");
            setCreatedEpc("");

            if (isEditing && editingAssetId) {
                await updateAssetApi(editingAssetId, buildUpdatePayload(form, !locationLocked, locationLocked && homeNeedsVerification));
            } else {
                const created = await createAssetApi(buildCreatePayload(form));
                setCreatedEpc(created.epc?.epcCode || "");
            }

            setForm(initialForm);
            setEditingAssetId(null);
            await loadAssets();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save asset. Please try again."));
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteAsset() {
        if (!editingAssetId) return false;
        try {
            setSaving(true); setError("");
            await deleteAssetApi(editingAssetId);
            setEditingAssetId(null); setForm(initialForm);
            await loadAssets();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to delete asset."));
            return false;
        } finally { setSaving(false); }
    }

    useEffect(() => {
        // Initial data fetch is the external synchronization owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadPageData();
    }, []);

    return {
        assets,
        assetCategories,
        locations,
        form,
        loading,
        saving,
        error,
        createdEpc,
        isEditing,
        editingAssetId,
        locationLocked,
        homeNeedsVerification,
        updateForm,
        loadPageData,
        handleEditAsset,
        handleCancelEdit,
        handleSubmitAsset,
        handleDeleteAsset,
    };
}
