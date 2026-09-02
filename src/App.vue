<script setup lang="ts">
import { onMounted } from 'vue';
import { useAmaroStore } from './stores/amaroStore';
import AmaroFilterBar from './components/AmaroFilterBar.vue';
import AmaroCard from './components/AmaroCard.vue';

const amaroStore = useAmaroStore();

onMounted(() => {
  amaroStore.fetchBottles();
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-content">
        <h1>Amaro Collection</h1>
        <p class="subtitle">A personal catalog of regional digestifs, botanical bitters, and herbal spirits.</p>
      </div>
      <div class="header-stats" v-if="!amaroStore.isLoading">
        <span class="stat-badge">
          <strong>{{ amaroStore.filteredBottles.length }}</strong> / {{ amaroStore.totalBottlesCount }} Bottles
        </span>
      </div>
    </header>

    <main class="app-main">
      <AmaroFilterBar />

      <div v-if="amaroStore.isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading amaro collection...</p>
      </div>

      <div v-else-if="amaroStore.error" class="error-state">
        <p class="error-message">{{ amaroStore.error }}</p>
        <button class="retry-btn" @click="amaroStore.fetchBottles()">Retry</button>
      </div>

      <div v-else-if="amaroStore.filteredBottles.length === 0" class="empty-state">
        <p>No bottles match your current filter criteria.</p>
        <button class="reset-btn" @click="amaroStore.resetFilters()">Reset Filters</button>
      </div>

      <div v-else class="bottle-grid">
        <AmaroCard
          v-for="bottle in amaroStore.filteredBottles"
          :key="bottle.id"
          :bottle="bottle"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #2c3e50;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 1.5rem;
  margin-bottom: 2rem;
}

.app-header h1 {
  margin: 0;
  font-size: 2.25rem;
  font-weight: 700;
  color: #1a202c;
}

.subtitle {
  margin: 0.5rem 0 0 0;
  color: #718096;
  font-size: 1rem;
}

.stat-badge {
  background-color: #edf2f7;
  color: #4a5568;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
}

.app-main {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 4rem 1rem;
  background-color: #f7fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e0;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid #e2e8f0;
  border-top-color: #3182ce;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: #e53e3e;
  margin-bottom: 1rem;
}

.retry-btn,
.reset-btn {
  background-color: #3182ce;
  color: white;
  border: none;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.retry-btn:hover,
.reset-btn:hover {
  background-color: #2b6cb0;
}

.bottle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}
</style>