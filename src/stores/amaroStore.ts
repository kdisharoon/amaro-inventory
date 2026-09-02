import { defineStore } from 'pinia';
import { AmaroBottle, CreateAmaroBottlePayload } from '../types/amaro';
import { amaroApiClient } from '../api/amaroClient';

export interface AmaroFilterState {
  searchQuery: string;
  maxAbv: number | null;
  sweetnessLevel: 'all' | 'dry' | 'semi-sweet' | 'sweet';
}

export const useAmaroStore = defineStore('amaro', {
  state: () => ({
    bottles: [] as AmaroBottle[],
    isLoading: false as boolean,
    error: null as string | null,
    filters: {
      searchQuery: '',
      maxAbv: null,
      sweetnessLevel: 'all',
    } as AmaroFilterState,
  }),

  getters: {
    filteredBottles(state): AmaroBottle[] {
      return state.bottles.filter((bottle) => {
        // Search filter (matches name, producer, region, or flavor notes)
        if (state.filters.searchQuery.trim() !== '') {
          const query = state.filters.searchQuery.toLowerCase();
          const matchesName = bottle.name.toLowerCase().includes(query);
          const matchesProducer = bottle.producer.toLowerCase().includes(query);
          const matchesRegion = bottle.region.toLowerCase().includes(query);
          const matchesNotes = bottle.flavorNotes.some((note) =>
            note.toLowerCase().includes(query)
          );

          if (!matchesName && !matchesProducer && !matchesRegion && !matchesNotes) {
            return false;
          }
        }

        // ABV Filter
        if (state.filters.maxAbv !== null && bottle.abv > state.filters.maxAbv) {
          return false;
        }

        // Sweetness Level Filter
        if (
          state.filters.sweetnessLevel !== 'all' &&
          bottle.sweetnessLevel !== state.filters.sweetnessLevel
        ) {
          return false;
        }

        return true;
      });
    },

    totalBottlesCount(state): number {
      return state.bottles.length;
    },

    availableRegions(state): string[] {
      const regions = state.bottles.map((b) => b.region);
      return Array.from(new Set(regions)).sort();
    },
  },

  actions: {
    async fetchBottles(): Promise<void> {
      this.isLoading = true;
      this.error = null;
      try {
        this.bottles = await amaroApiClient.getBottles();
      } catch (err: any) {
        this.error = err?.message || 'Failed to load amaro collection.';
        console.error('Error in amaroStore.fetchBottles:', err);
      } finally {
        this.isLoading = false;
      }
    },

    async addBottle(payload: CreateAmaroBottlePayload): Promise<AmaroBottle | null> {
      this.isLoading = true;
      this.error = null;
      try {
        const newBottle = await amaroApiClient.addBottle(payload);
        this.bottles.push(newBottle);
        return newBottle;
      } catch (err: any) {
        this.error = err?.message || 'Failed to add amaro bottle.';
        console.error('Error in amaroStore.addBottle:', err);
        return null;
      } finally {
        this.isLoading = false;
      }
    },

    setFilters(partialFilters: Partial<AmaroFilterState>): void {
      this.filters = { ...this.filters, ...partialFilters };
    },

    resetFilters(): void {
      this.filters = {
        searchQuery: '',
        maxAbv: null,
        sweetnessLevel: 'all',
      };
    },
  },
});