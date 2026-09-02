/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onMounted } from 'vue';
import { useAmaroStore } from './stores/amaroStore';
import AmaroFilterBar from './components/AmaroFilterBar.vue';
import AmaroCard from './components/AmaroCard.vue';
const amaroStore = useAmaroStore();
onMounted(() => {
    amaroStore.fetchBottles();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "app-container" },
});
/** @type {__VLS_StyleScopedClasses['app-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "app-header" },
});
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-content" },
});
/** @type {__VLS_StyleScopedClasses['header-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "subtitle" },
});
/** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
if (!__VLS_ctx.amaroStore.isLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "header-stats" },
    });
    /** @type {__VLS_StyleScopedClasses['header-stats']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-badge']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.amaroStore.filteredBottles.length);
    (__VLS_ctx.amaroStore.totalBottlesCount);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "app-main" },
});
/** @type {__VLS_StyleScopedClasses['app-main']} */ ;
const __VLS_0 = AmaroFilterBar;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
if (__VLS_ctx.amaroStore.isLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-state" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spinner" },
    });
    /** @type {__VLS_StyleScopedClasses['spinner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
}
else if (__VLS_ctx.amaroStore.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "error-state" },
    });
    /** @type {__VLS_StyleScopedClasses['error-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "error-message" },
    });
    /** @type {__VLS_StyleScopedClasses['error-message']} */ ;
    (__VLS_ctx.amaroStore.error);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.amaroStore.isLoading))
                    throw 0;
                if (!(__VLS_ctx.amaroStore.error))
                    throw 0;
                return (__VLS_ctx.amaroStore.fetchBottles());
                // @ts-ignore
                [amaroStore, amaroStore, amaroStore, amaroStore, amaroStore, amaroStore, amaroStore,];
            } },
        ...{ class: "retry-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
}
else if (__VLS_ctx.amaroStore.filteredBottles.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.amaroStore.isLoading))
                    throw 0;
                if (!!(__VLS_ctx.amaroStore.error))
                    throw 0;
                if (!(__VLS_ctx.amaroStore.filteredBottles.length === 0))
                    throw 0;
                return (__VLS_ctx.amaroStore.resetFilters());
                // @ts-ignore
                [amaroStore, amaroStore,];
            } },
        ...{ class: "reset-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bottle-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['bottle-grid']} */ ;
    for (const [bottle] of __VLS_vFor((__VLS_ctx.amaroStore.filteredBottles))) {
        const __VLS_5 = AmaroCard;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            key: (bottle.id),
            bottle: (bottle),
        }));
        const __VLS_7 = __VLS_6({
            key: (bottle.id),
            bottle: (bottle),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        // @ts-ignore
        [amaroStore,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
