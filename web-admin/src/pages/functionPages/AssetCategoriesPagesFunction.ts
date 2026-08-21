import type { FormEvent} from 'react';
import { useEffect, useState } from 'react';
import { type AssetCategory, createAssetCategoryApi, getAssetCategoriesApi } from '../../api/assetCategories.api';


type AssetCategoryFormState = {
    categoryCode: string;
    name: string;
    description: string;
};

const initialForm: AssetCategoryFormState = {
    categoryCode: "",
    name: "",
    description: "",
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
    };
}

export function useAssetCategoriesPagesFunction() {
    const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
    const [form, setForm] = useState<AssetCategoryFormState>(initialForm);

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
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to load asset categories."
            )
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateAssetCategory(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            await createAssetCategoryApi(buildCreatePayload(form));

            setForm(initialForm);
            await loadAssetCategories();
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to create asset category."
            );
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        loadAssetCategories();
    }, []);

    return {
        assetCategories,
        form,
        loading,
        saving,
        error,
        updateForm,
        handleCreateAssetCategory,
        loadAssetCategories,
    }
}

