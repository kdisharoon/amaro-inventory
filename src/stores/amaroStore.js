import { defineStore } from 'pinia';
import { amaroApiClient } from '../api/amaroClient';
export const useAmaroStore = defineStore('amaro', {
    state: () => ({
        bottles: [],
        isLoading: false,
        error: null,
        filters: {
            searchQuery: '',
            maxAbv: null,
            sweetnessLevel: 'all',
        },
    }),
    getters: {
        /**
         * Returns filtered list of bottles based on search query, max ABV, and sweetness level.
         */
        filteredBottles(state) {
            return state.bottles.filter((bottle) => {
                // Search filter (matches name, producer, region, or flavor notes)
                if (state.filters.searchQuery.trim() !== '') {
                    const query = state.filters.searchQuery.toLowerCase();
                    const matchesName = bottle.name.toLowerCase().includes(query);
                    const matchesProducer = bottle.producer.toLowerCase().includes(query);
                    const matchesRegion = bottle.region.toLowerCase().includes(query);
                    const matchesNotes = bottle.flavorNotes.some((note) => note.toLowerCase().includes(query));
                    if (!matchesName && !matchesProducer && !matchesRegion && !matchesNotes) {
                        return false;
                    }
                }
                // ABV Filter
                if (state.filters.maxAbv !== null && bottle.abv > state.filters.maxAbv) {
                    return false;
                }
                // Sweetness Level Filter
                if (state.filters.sweetnessLevel !== 'all' &&
                    bottle.sweetnessLevel !== state.filters.sweetnessLevel) {
                    return false;
                }
                return true;
            });
        },
        /**
         * Total count of bottles in catalog.
         */
        totalBottlesCount(state) {
            return state.bottles.length;
        },
        /**
         * Returns a list of unique regions present in the current catalog.
         */
        availableRegions(state) {
            const regions = state.bottles.map((b) => b.region);
            return Array.from(new Set(regions)).sort();
        },
    },
    actions: {
        /**
         * Fetches all bottles from the API Gateway endpoint.
         */
        async fetchBottles() {
            this.isLoading = true;
            this.error = null;
            try {
                this.bottles = await amaroApiClient.getBottles();
            }
            catch (err) {
                this.error = err?.message || 'Failed to load amaro collection.';
                console.error('Error in amaroStore.fetchBottles:', err);
            }
            finally {
                this.isLoading = false;
            }
        },
        /**
         * Adds a new amaro bottle to the catalog.
         */
        async addBottle(payload) {
            this.isLoading = true;
            this.error = null;
            try {
                const newBottle = await amaroApiClient.addBottle(payload);
                this.bottles.push(newBottle);
                return newBottle;
            }
            catch (err) {
                this.error = err?.message || 'Failed to add amaro bottle.';
                console.error('Error in amaroStore.addBottle:', err);
                return null;
            }
            finally {
                this.isLoading = false;
            }
        },
        /**
         * Updates search & filter criteria.
         */
        setFilters(partialFilters) {
            this.filters = { ...this.filters, ...partialFilters };
        },
        /**
         * Resets all search filters.
         */
        resetFilters() {
            this.filters = {
                searchQuery: '',
                maxAbv: null,
                sweetnessLevel: 'all',
            };
        },
    },
});
