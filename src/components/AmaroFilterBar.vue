<script setup lang="ts">
import { useAmaroStore } from '../stores/amaroStore';

const amaroStore = useAmaroStore();

const onSearchInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  amaroStore.setFilters({ searchQuery: target.value });
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
  </div>
</template>

<style scoped>
.filter-bar {
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.875rem 1.25rem;
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
</style>
