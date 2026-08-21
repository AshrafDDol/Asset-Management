import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { getAssetsApi, createAssetApi, updateAssetApi, type Asset } from '../../api/assets.api';
import { type AssetCategory, getAssetCategoriesApi } from '../../api/assetCategories.api';
import { type Department, getDepartmentsApi } from '../../api/departments.api';
import { type Location, getLocationsApi } from '../../api/locations.api';

type AssetFormState = {
    assetCode: string;
    itemName: string;
    categoryId: string;
    departmentId: string;
    locationId: string;
    serialNumber: string;
    brand: string;
    model: string;
    purchaseDate: string;
    purchaseCost: string;
    status: string;
    condition: string;
    remarks: string;
    isActive: boolean;
};

const initialForm: AssetFormState = {
    assetCode: "",
    itemName: "",
    categoryId: "",
    departmentId: "",
    locationId: "",
    serialNumber: "",
    brand: "",
    model: "",
    purchaseDate: "",
    purchaseCost: "",
    status: "",
    condition: "",
    remarks: "",
    isActive: true,
};

function validateForm(form: AssetFormState): string | null {
    if (!form.assetCode.trim()) {
        return "Asset code is required.";
    }

    if (!form.itemName.trim()) {
        return "Item name is required.";
    }

    if (!form.categoryId) {
        return "Category is required.";
    }

    return null;
}

function buildCreatePayload(form: AssetFormState) {
    return {
        assetCode: form.assetCode.trim(),
        itemName: form.itemName.trim(),
        categoryId: Number(form.categoryId),
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        purchaseDate: form.purchaseDate || undefined,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        status: form.status.trim() || undefined,
        condition: form.condition.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
    };
}

function buildUpdatePayload(form: AssetFormState) {
    return {
        ...buildCreatePayload(form),
        isActive: form.isActive,
    };
}

export function useAssetsPagesFunction() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [form, setForm] = useState<AssetFormState>(initialForm);

    const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const isEditing = editingAssetId !== null;

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

            const [assetData, categoryData, departmentData, locationData] =
                await Promise.all([
                    getAssetsApi(),
                    getAssetCategoriesApi(),
                    getDepartmentsApi(),
                    getLocationsApi(),
                ]);
            
            setAssets(Array.isArray(assetData) ? assetData : []);
            setAssetCategories(Array.isArray(categoryData) ? categoryData : []);
            setDepartments(Array.isArray(departmentData) ? departmentData : []);
            setLocations(Array.isArray(locationData) ? locationData : []);
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to load data. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    function handleEditAsset(asset: Asset) {
        setEditingAssetId(asset.id);

        setForm({
            assetCode: asset.assetCode || "",
            itemName: asset.itemName || "",
            categoryId: asset.categoryId ? String(asset.categoryId) : "",
            departmentId: asset.departmentId ? String(asset.departmentId) : "",
            locationId: asset.locationId ? String(asset.locationId) : "",
            serialNumber: asset.serialNumber || "",
            brand: asset.brand || "",
            model: asset.model || "",
            purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
            purchaseCost:
                asset.purchaseCost !== null && asset.purchaseCost !== undefined
                ? String(asset.purchaseCost)
                : "",
            status: asset.status || "",
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

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (isEditing && editingAssetId) {
                await updateAssetApi(editingAssetId, buildUpdatePayload(form));
            } else {
                await createAssetApi(buildCreatePayload(form));
            }

            setForm(initialForm);
            setEditingAssetId(null);
            await loadAssets();
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to save asset. Please try again."
            );
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        loadPageData();
    }, []);

    return {
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
    };
}