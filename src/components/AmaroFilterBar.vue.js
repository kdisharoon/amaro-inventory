/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useAmaroStore } from '../stores/amaroStore';
const amaroStore = useAmaroStore();
const onSearchInput = (e) => {
    const target = e.target;
    amaroStore.setFilters({ searchQuery: target.value });
};
const onAbvChange = (e) => {
    const target = e.target;
    const val = target.value ? Number(target.value) : null;
    amaroStore.setFilters({ maxAbv: val });
};
const onSweetnessChange = (level) => {
    amaroStore.setFilters({ sweetnessLevel: level });
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-bar" },
});
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-group search-group" },
});
/** @type {__VLS_StyleScopedClasses['filter-group']} */ ;
/** @type {__VLS_StyleScopedClasses['search-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onInput: (__VLS_ctx.onSearchInput) },
    type: "text",
    placeholder: "Search by name, producer, region, or botanicals...",
    value: (__VLS_ctx.amaroStore.filters.searchQuery),
    ...{ class: "search-input" },
});
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-controls" },
});
/** @type {__VLS_StyleScopedClasses['filter-controls']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-group" },
});
/** @type {__VLS_StyleScopedClasses['filter-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    for: "abv-filter",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    ...{ onChange: (__VLS_ctx.onAbvChange) },
    id: "abv-filter",
    value: (__VLS_ctx.amaroStore.filters.maxAbv ?? ''),
    ...{ class: "select-input" },
});
/** @type {__VLS_StyleScopedClasses['select-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "20",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "25",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "30",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "35",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-group sweetness-group" },
});
/** @type {__VLS_StyleScopedClasses['filter-group']} */ ;
/** @type {__VLS_StyleScopedClasses['sweetness-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "filter-label" },
});
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "button-toggle-group" },
});
/** @type {__VLS_StyleScopedClasses['button-toggle-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.onSweetnessChange('all'));
            // @ts-ignore
            [onSearchInput, amaroStore, amaroStore, onAbvChange, onSweetnessChange,];
        } },
    ...{ class: (['toggle-btn', { active: __VLS_ctx.amaroStore.filters.sweetnessLevel === 'all' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.onSweetnessChange('dry'));
            // @ts-ignore
            [amaroStore, onSweetnessChange,];
        } },
    ...{ class: (['toggle-btn', { active: __VLS_ctx.amaroStore.filters.sweetnessLevel === 'dry' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.onSweetnessChange('semi-sweet'));
            // @ts-ignore
            [amaroStore, onSweetnessChange,];
        } },
    ...{ class: (['toggle-btn', { active: __VLS_ctx.amaroStore.filters.sweetnessLevel === 'semi-sweet' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.onSweetnessChange('sweet'));
            // @ts-ignore
            [amaroStore, onSweetnessChange,];
        } },
    ...{ class: (['toggle-btn', { active: __VLS_ctx.amaroStore.filters.sweetnessLevel === 'sweet' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
// @ts-ignore
[amaroStore,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
