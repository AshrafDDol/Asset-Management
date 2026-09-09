import type { FormEvent} from 'react';
import { useEffect, useState } from 'react';
import { type AssetCategory, createAssetCategoryApi, getAssetCategoriesApi, updateAssetCategoryApi, deleteAssetCategoryApi } from '../../api/assetCategories.api';
import { errorMessage } from '../../utils/errorMessage';


type AssetCategoryFormState = {
    categoryCode: string;
    name: string;
    description: string;
    isActive: boolean;
};

const initialForm: AssetCategoryFormState = {
    categoryCode: "",
    name: "",
    description: "",
    isActive: true,
};

function validateForm(form: AssetCategoryFormState): string | null {
    if (!form.categoryCode.trim()) {
        return "Category code is required.";
    }

    if (!form.name.trim()) {
        return "Name is required.";
    }

    return null;
}

function buildCreatePayload(form: AssetCategoryFormState) {
    return {
        categoryCode: form.categoryCode.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: form.isActive,
    };
}

export function useAssetCategoriesPagesFunction() {
    const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
    const [form, setForm] = useState<AssetCategoryFormState>(initialForm);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function updateForm<K extends keyof AssetCategoryFormState>(
        key: K,
        value: AssetCategoryFormState[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    async function loadAssetCategories() {
        try {
            setLoading(true);
            setError("");

            const data = await getAssetCategoriesApi();
            setAssetCategories(Array.isArray(data) ? data : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load Asset categories."));
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmitAssetCategory(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (editingId) await updateAssetCategoryApi(editingId, buildCreatePayload(form));
            else await createAssetCategoryApi(buildCreatePayload(form));

            setForm(initialForm);
            setEditingId(null);
            await loadAssetCategories();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save Asset category."));
        } finally {
            setSaving(false);
        }
        return false;
    }

    async function handleDeleteAssetCategory() {
        if (!editingId) return false;
        try {
            setSaving(true); setError("");
            await deleteAssetCategoryApi(editingId);
            setEditingId(null); setForm(initialForm);
            await loadAssetCategories();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to delete category."));
            return false;
        } finally { setSaving(false); }
    }

    useEffect(() => {
        // Initial API synchronization is intentionally owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadAssetCategories();
    }, []);

    return {
        assetCategories,
        form,
        loading,
        saving,
        error,
        updateForm,
        editingId,
        handleSubmitAssetCategory,
        handleEditAssetCategory: (category: AssetCategory) => {
            setEditingId(category.id);
            setForm({ categoryCode: category.categoryCode, name: category.name, description: category.description || "", isActive: category.isActive !== false });
            setError("");
        },
        handleCancelEdit: () => { setEditingId(null); setForm(initialForm); setError(""); },
        handleDeleteAssetCategory,
        loadAssetCategories,
    }
}

