/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/kdish/OneDrive/Desktop/git/amaro-inventory/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const __VLS_props = defineProps();
const formatSweetness = (level) => {
    if (!level)
        return '';
    switch (level) {
        case 'dry': return 'Dry';
        case 'semi-sweet': return 'Semi-Sweet';
        case 'sweet': return 'Sweet';
        default: return level;
    }
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['amaro-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sweetness-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['sweetness-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['sweetness-badge']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "amaro-card" },
});
/** @type {__VLS_StyleScopedClasses['amaro-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-header" },
});
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
    ...{ class: "bottle-name" },
});
/** @type {__VLS_StyleScopedClasses['bottle-name']} */ ;
(__VLS_ctx.bottle.name);
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "producer" },
});
/** @type {__VLS_StyleScopedClasses['producer']} */ ;
(__VLS_ctx.bottle.producer);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "region" },
});
/** @type {__VLS_StyleScopedClasses['region']} */ ;
(__VLS_ctx.bottle.region);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "abv-badge" },
});
/** @type {__VLS_StyleScopedClasses['abv-badge']} */ ;
(__VLS_ctx.bottle.abv);
if (__VLS_ctx.bottle.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "description" },
    });
    /** @type {__VLS_StyleScopedClasses['description']} */ ;
    (__VLS_ctx.bottle.description);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "meta-row" },
});
/** @type {__VLS_StyleScopedClasses['meta-row']} */ ;
if (__VLS_ctx.bottle.sweetnessLevel) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: (['sweetness-badge', __VLS_ctx.bottle.sweetnessLevel]) },
    });
    /** @type {__VLS_StyleScopedClasses['sweetness-badge']} */ ;
    (__VLS_ctx.formatSweetness(__VLS_ctx.bottle.sweetnessLevel));
}
if (__VLS_ctx.bottle.rating) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "rating" },
    });
    /** @type {__VLS_StyleScopedClasses['rating']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "star" },
    });
    /** @type {__VLS_StyleScopedClasses['star']} */ ;
    (__VLS_ctx.bottle.rating);
}
if (__VLS_ctx.bottle.flavorNotes && __VLS_ctx.bottle.flavorNotes.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "flavor-notes" },
    });
    /** @type {__VLS_StyleScopedClasses['flavor-notes']} */ ;
    for (const [note] of __VLS_vFor((__VLS_ctx.bottle.flavorNotes))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (note),
            ...{ class: "note-tag" },
        });
        /** @type {__VLS_StyleScopedClasses['note-tag']} */ ;
        (note);
        // @ts-ignore
        [bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, bottle, formatSweetness,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
