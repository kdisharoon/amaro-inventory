<script setup lang="ts">
import { computed } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import type { BottleStatus, AmaroBottle } from '../types/amaro';

const emit = defineEmits<{
  (e: 'select-bottle', bottle: AmaroBottle): void;
}>();

const amaroStore = useAmaroStore();

const currentStatus = computed(() => amaroStore.filters.status || 'all');
const isFiltered = computed(
  () => amaroStore.filters.searchQuery.trim() !== '' || currentStatus.value !== 'all'
);

const onSearchInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  amaroStore.setFilters({ searchQuery: target.value });
};

const setStatusFilter = (status: BottleStatus | 'all') => {
  amaroStore.setFilters({ status });
};

const pickRandomOpenedBottle = () => {
  const randomBottle = amaroStore.getRandomOpenedBottle();
  if (!randomBottle) {
    window.alert('No bottles are currently marked as Opened in your collection.');
    return;
  }
  emit('select-bottle', randomBottle);
};
</script>

<template>
  <div class="filter-bar">
    <div class="filter-top-row">
      <div class="search-group">
        <input
          type="text"
          placeholder="Search by name, producer, region, or botanicals..."
          :value="amaroStore.filters.searchQuery"
          @input="onSearchInput"
          class="search-input"
        />
        <button
          v-if="amaroStore.filters.searchQuery"
          type="button"
          class="clear-search-btn"
          aria-label="Clear search"
          @click="amaroStore.setFilters({ searchQuery: '' })"
        >
          &times;
        </button>
      </div>

      <button
        type="button"
        class="random-opened-btn"
        :disabled="amaroStore.openedBottlesCount === 0"
        :title="amaroStore.openedBottlesCount === 0 ? 'No opened bottles available' : 'Randomly pick an opened bottle'"
        @click="pickRandomOpenedBottle"
      >
        <span class="btn-icon">🎲</span>
        <span class="btn-text">Random Opened Bottle</span>
      </button>
    </div>

    <div class="status-filter-row">
      <span class="status-label">Status:</span>
      <div class="status-pills">
        <button
          type="button"
          :class="['status-pill', 'all', { active: currentStatus === 'all' }]"
          @click="setStatusFilter('all')"
        >
          All <span class="pill-count">({{ amaroStore.totalBottlesCount }})</span>
        </button>

        <button
          type="button"
          :class="['status-pill', 'opened', { active: currentStatus === 'opened' }]"
          @click="setStatusFilter('opened')"
        >
          Opened <span class="pill-count">({{ amaroStore.openedBottlesCount }})</span>
        </button>

        <button
          type="button"
          :class="['status-pill', 'unopened', { active: currentStatus === 'unopened' }]"
          @click="setStatusFilter('unopened')"
        >
          Not Opened <span class="pill-count">({{ amaroStore.unopenedBottlesCount }})</span>
        </button>

        <button
          type="button"
          :class="['status-pill', 'finished', { active: currentStatus === 'finished' }]"
          @click="setStatusFilter('finished')"
        >
          Finished <span class="pill-count">({{ amaroStore.finishedBottlesCount }})</span>
        </button>
      </div>

      <button
        v-if="isFiltered"
        type="button"
        class="reset-filters-btn"
        @click="amaroStore.resetFilters()"
      >
        Clear Filters
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.filter-top-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-group {
  position: relative;
  flex: 1;
}

.search-input {
  width: 100%;
  padding: 0.65rem 2.2rem 0.65rem 0.875rem;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  font-size: 0.95rem;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-input:focus {
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.15);
}

.clear-search-btn {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 1.2rem;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.2rem;
}

.clear-search-btn:hover {
  color: #475569;
}

.random-opened-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #f59e0b;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 0.65rem 1rem;
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.random-opened-btn:hover:not(:disabled) {
  background: #d97706;
}

.random-opened-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.random-opened-btn:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-icon {
  font-size: 1.05rem;
}

.status-filter-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.status-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
}

.status-pills {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  border-radius: 9999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.status-pill:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.status-pill.active.all {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
  font-weight: 600;
}

.status-pill.active.opened {
  background: #d97706;
  border-color: #d97706;
  color: #ffffff;
  font-weight: 600;
}

.status-pill.active.unopened {
  background: #0d9488;
  border-color: #0d9488;
  color: #ffffff;
  font-weight: 600;
}

.status-pill.active.finished {
  background: #475569;
  border-color: #475569;
  color: #ffffff;
  font-weight: 600;
}

.pill-count {
  font-size: 0.75rem;
  opacity: 0.85;
}

.reset-filters-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0.2rem 0.4rem;
}

.reset-filters-btn:hover {
  color: #1e293b;
}

@media (max-width: 640px) {
  .filter-top-row {
    flex-direction: column;
    align-items: stretch;
  }

  .random-opened-btn {
    justify-content: center;
  }

  .reset-filters-btn {
    margin-left: 0;
  }
}
</style>
