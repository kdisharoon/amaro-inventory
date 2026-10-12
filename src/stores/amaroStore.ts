import { defineStore } from 'pinia';
import { AmaroBottle, BottleStatus, CreateAmaroBottlePayload, UpdateAmaroBottlePayload } from '../types/amaro';
import { amaroApiClient } from '../api/amaroClient';

function shuffleBottles<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getStatusRank(status?: string): number {
  if (status === 'opened') return 0;
  if (status === 'finished') return 2;
  return 1; // unopened or default
}

function orderBottlesByStatusAndShuffle(items: AmaroBottle[]): AmaroBottle[] {
  const opened: AmaroBottle[] = [];
  const unopened: AmaroBottle[] = [];
  const finished: AmaroBottle[] = [];

  for (const bottle of items) {
    const status = bottle.status || 'unopened';
    if (status === 'opened') {
      opened.push(bottle);
    } else if (status === 'finished') {
      finished.push(bottle);
    } else {
      unopened.push(bottle);
    }
  }

  return [
    ...shuffleBottles(opened),
    ...shuffleBottles(unopened),
    ...shuffleBottles(finished),
  ];
}

export interface AmaroFilterState {
  searchQuery: string;
  status: BottleStatus | 'all';
}

export const useAmaroStore = defineStore('amaro', {
  state: () => ({
    bottles: [] as AmaroBottle[],
    isLoading: false as boolean,
    error: null as string | null,
    filters: {
      searchQuery: '',
      status: 'all',
    } as AmaroFilterState,
  }),

  getters: {
    filteredBottles(state): AmaroBottle[] {
      return state.bottles.filter((bottle) => {
        // Status filter
        if (state.filters.status && state.filters.status !== 'all') {
          const bottleStatus = bottle.status || 'unopened';
          if (bottleStatus !== state.filters.status) {
            return false;
          }
        }

        // Search filter (matches name, producer, region, or flavor notes)
        if (state.filters.searchQuery.trim() !== '') {
          const query = state.filters.searchQuery.toLowerCase();
          const matchesName = bottle.name.toLowerCase().includes(query);
          const matchesProducer = bottle.producer.toLowerCase().includes(query);
          const matchesRegion = (bottle.region || '').toLowerCase().includes(query);
          const matchesNotes = bottle.flavorNotes.some((note) =>
            note.toLowerCase().includes(query)
          );

          if (!matchesName && !matchesProducer && !matchesRegion && !matchesNotes) {
            return false;
          }
        }

        return true;
      });
    },

    totalBottlesCount(state): number {
      return state.bottles.length;
    },

    openedBottlesCount(state): number {
      return state.bottles.filter((b) => b.status === 'opened').length;
    },

    unopenedBottlesCount(state): number {
      return state.bottles.filter((b) => (b.status || 'unopened') === 'unopened').length;
    },

    finishedBottlesCount(state): number {
      return state.bottles.filter((b) => b.status === 'finished').length;
    },

    availableRegions(state): string[] {
      const regions = state.bottles.map((b) => b.region).filter((r): r is string => Boolean(r));
      return Array.from(new Set(regions)).sort();
    },
  },

  actions: {
    async fetchBottles(): Promise<void> {
      this.isLoading = true;
      this.error = null;
      try {
        const fetched = await amaroApiClient.getBottles();
        this.bottles = orderBottlesByStatusAndShuffle(fetched);
      } catch (err: any) {
        this.error = err?.message || 'Failed to load amaro collection.';
        console.error('Error in amaroStore.fetchBottles:', err);
      } finally {
        this.isLoading = false;
      }
    },

    shuffleCollection(): void {
      this.bottles = orderBottlesByStatusAndShuffle(this.bottles);
    },

    async addBottle(payload: CreateAmaroBottlePayload, idToken?: string): Promise<AmaroBottle | null> {
      this.isLoading = true;
      this.error = null;
      try {
        const newBottle = await amaroApiClient.addBottle(payload, idToken);
        const updatedList = [...this.bottles, newBottle];
        this.bottles = updatedList.sort((a, b) => getStatusRank(a.status) - getStatusRank(b.status));
        return newBottle;
      } catch (err: any) {
        this.error = err?.message || 'Failed to add amaro bottle.';
        console.error('Error in amaroStore.addBottle:', err);
        return null;
      } finally {
        this.isLoading = false;
      }
    },

    async updateBottle(id: string, payload: UpdateAmaroBottlePayload, idToken?: string): Promise<AmaroBottle | null> {
      this.isLoading = true;
      this.error = null;
      try {
        const updatedBottle = await amaroApiClient.updateBottle(id, payload, idToken);
        const updatedList = this.bottles.map((bottle) => bottle.id === id ? updatedBottle : bottle);
        this.bottles = updatedList.sort((a, b) => getStatusRank(a.status) - getStatusRank(b.status));
        return updatedBottle;
      } catch (err: any) {
        this.error = err?.message || 'Failed to update amaro bottle.';
        console.error('Error in amaroStore.updateBottle:', err);
        return null;
      } finally {
        this.isLoading = false;
      }
    },

    async deleteBottle(id: string, idToken?: string): Promise<boolean> {
      this.isLoading = true;
      this.error = null;
      try {
        await amaroApiClient.deleteBottle(id, idToken);
        this.bottles = this.bottles.filter((bottle) => bottle.id !== id);
        return true;
      } catch (err: any) {
        this.error = err?.message || 'Failed to delete amaro bottle.';
        console.error('Error in amaroStore.deleteBottle:', err);
        return false;
      } finally {
        this.isLoading = false;
      }
    },

    setFilters(partialFilters: Partial<AmaroFilterState>): void {
      this.filters = { ...this.filters, ...partialFilters };
    },

    getRandomOpenedBottle(): AmaroBottle | null {
      const opened = this.bottles.filter((b) => b.status === 'opened');
      if (opened.length === 0) return null;
      const index = Math.floor(Math.random() * opened.length);
      return opened[index];
    },

    resetFilters(): void {
      this.filters = {
        searchQuery: '',
        status: 'all',
      };
    },
  },
});