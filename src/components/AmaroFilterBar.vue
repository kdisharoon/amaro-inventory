<script setup lang="ts">
import { useAmaroStore } from '../stores/amaroStore';

const amaroStore = useAmaroStore();

const onSearchInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  amaroStore.setFilters({ searchQuery: target.value });
};

const onAbvChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const val = target.value ? Number(target.value) : null;
  amaroStore.setFilters({ maxAbv: val });
};

const onSweetnessChange = (level: 'all' | 'dry' | 'semi-sweet' | 'sweet') => {
  amaroStore.setFilters({ sweetnessLevel: level });
};
</script>

<template>
  <div class="filter-bar">
    <div class="filter-group search-group">
      <input
        type="text"
        placeholder="Search by name, producer, region, or botanicals..."
        :value="amaroStore.filters.searchQuery"
        @input="onSearchInput"
        class="search-input"
      />
    </div>

    <div class="filter-controls">
      <div class="filter-group">
        <label for="abv-filter">Max ABV:</label>
        <select
          id="abv-filter"
          :value="amaroStore.filters.maxAbv ?? ''"
          @change="onAbvChange"
          class="select-input"
        >
          <option value="">Any ABV</option>
          <option value="20">Up to 20%</option>
          <option value="25">Up to 25%</option>
          <option value="30">Up to 30%</option>
          <option value="35">Up to 35%</option>
        </select>
      </div>

      <div class="filter-group sweetness-group">
        <span class="filter-label">Sweetness:</span>
        <div class="button-toggle-group">
          <button
            :class="['toggle-btn', { active: amaroStore.filters.sweetnessLevel === 'all' }]"
            @click="onSweetnessChange('all')"
          >
            All
          </button>
          <button
            :class="['toggle-btn', { active: amaroStore.filters.sweetnessLevel === 'dry' }]"
            @click="onSweetnessChange('dry')"
          >
            Dry
          </button>
          <button
            :class="['toggle-btn', { active: amaroStore.filters.sweetnessLevel === 'semi-sweet' }]"
            @click="onSweetnessChange('semi-sweet')"
          >
            Semi-Sweet
          </button>
          <button
            :class="['toggle-btn', { active: amaroStore.filters.sweetnessLevel === 'sweet' }]"
            @click="onSweetnessChange('sweet')"
          >
            Sweet
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.search-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  font-size: 0.95rem;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input:focus {
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.15);
}

.filter-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #4a5568;
}

.filter-label {
  font-weight: 500;
}

.select-input {
  padding: 0.4rem 0.75rem;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  background-color: #ffffff;
  font-size: 0.875rem;
  color: #2d3748;
}

.button-toggle-group {
  display: flex;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  overflow: hidden;
}

.toggle-btn {
  background-color: #ffffff;
  border: none;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  color: #4a5568;
  cursor: pointer;
  border-right: 1px solid #cbd5e0;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.toggle-btn:last-child {
  border-right: none;
}

.toggle-btn:hover {
  background-color: #edf2f7;
}

.toggle-btn.active {
  background-color: #3182ce;
  color: #ffffff;
  font-weight: 600;
}
</style>
