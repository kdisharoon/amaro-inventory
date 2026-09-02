/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
const amaroStore = useAmaroStore();
const name = ref('');
const producer = ref('');
const region = ref('');
const abv = ref(null);
const description = ref('');
const flavorNotes = ref(''); // comma-separated
const sweetnessLevel = ref('dry');
const isSubmitting = ref(false);
const error = ref(null);
const resetForm = () => {
    name.value = '';
    producer.value = '';
    region.value = '';
    abv.value = null;
    description.value = '';
    flavorNotes.value = '';
    sweetnessLevel.value = 'dry';
};
const submit = async () => {
    error.value = null;
    if (!name.value || !producer.value || abv.value === null) {
        error.value = 'Please provide at least name, producer and ABV.';
        return;
    }
    const payload = {
        name: name.value,
        producer: producer.value,
        region: region.value,
        abv: abv.value,
        description: description.value,
        flavorNotes: flavorNotes.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        sweetnessLevel: sweetnessLevel.value,
    };
    isSubmitting.value = true;
    try {
        const created = await amaroStore.addBottle(payload);
        if (created)
            resetForm();
    }
    catch (e) {
        error.value = e?.message || 'Failed to add bottle.';
    }
    finally {
        isSubmitting.value = false;
    }
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.submit) },
    ...{ class: "amaro-form" },
});
/** @type {__VLS_StyleScopedClasses['amaro-form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "row" },
});
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "Name",
});
(__VLS_ctx.name);
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "Producer",
});
(__VLS_ctx.producer);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "row" },
});
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "Region",
});
(__VLS_ctx.region);
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "number",
    min: "0",
    max: "100",
    placeholder: "ABV %",
});
(__VLS_ctx.abv);
__VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
    value: (__VLS_ctx.description),
    placeholder: "Description (optional)",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "Flavor notes (comma-separated)",
});
(__VLS_ctx.flavorNotes);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "row" },
});
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_ctx.sweetnessLevel),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "bone-dry",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "dry",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "semi-sweet",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "sweet",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
    disabled: (__VLS_ctx.isSubmitting),
});
(__VLS_ctx.isSubmitting ? 'Saving...' : 'Add Bottle');
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "form-error" },
    });
    /** @type {__VLS_StyleScopedClasses['form-error']} */ ;
    (__VLS_ctx.error);
}
// @ts-ignore
[submit, name, producer, region, abv, description, flavorNotes, sweetnessLevel, isSubmitting, isSubmitting, error, error,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
