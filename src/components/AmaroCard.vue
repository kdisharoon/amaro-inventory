<script setup lang="ts">
import { AmaroBottle } from '../types/amaro';

defineProps<{
  bottle: AmaroBottle;
}>();

const formatSweetness = (level?: string): string => {
  if (!level) return '';
  switch (level) {
    case 'dry': return 'Dry';
    case 'semi-sweet': return 'Semi-Sweet';
    case 'sweet': return 'Sweet';
    default: return level;
  }
};

const formatStatus = (status?: string): string => {
  if (!status) return 'Unknown';
  switch (status) {
    case 'unopened': return 'Not Opened';
    case 'opened': return 'Opened';
    case 'finished': return 'Finished';
    default: return status;
  }
};
</script>

<template>
  <div class="amaro-card">
    <div class="card-header">
      <div>
        <h3 class="bottle-name">{{ bottle.name }}</h3>
        <p class="producer">{{ bottle.producer }} &bull; <span class="region">{{ bottle.region }}</span></p>
      </div>
      <div class="abv-badge">{{ bottle.abv }}% ABV</div>
    </div>

    <p v-if="bottle.description" class="description">{{ bottle.description }}</p>

    <div class="meta-row">
      <span v-if="bottle.sweetnessLevel" :class="['sweetness-badge', bottle.sweetnessLevel]">
        {{ formatSweetness(bottle.sweetnessLevel) }}
      </span>

      <span class="status-badge" :class="bottle.status || 'unknown'">
        {{ formatStatus(bottle.status) }}
      </span>

      <span v-if="bottle.rating" class="rating">
        <span class="star">?</span> {{ bottle.rating }}/5
      </span>
    </div>

    <div v-if="bottle.flavorNotes && bottle.flavorNotes.length > 0" class="flavor-notes">
      <span v-for="note in bottle.flavorNotes" :key="note" class="note-tag">
        {{ note }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.amaro-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.amaro-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.bottle-name {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #1a202c;
}

.producer {
  margin: 0.25rem 0 0 0;
  font-size: 0.875rem;
  color: #718096;
}

.region {
  color: #4a5568;
  font-weight: 500;
}

.abv-badge {
  background-color: #f7fafc;
  border: 1px solid #cbd5e0;
  color: #2d3748;
  font-weight: 600;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  white-space: nowrap;
}

.description {
  font-size: 0.875rem;
  color: #4a5568;
  line-height: 1.4;
  margin: 0 0 1rem 0;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
}

.sweetness-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.sweetness-badge.dry {
  background-color: #feebc8;
  color: #744210;
}

.sweetness-badge.semi-sweet {
  background-color: #e2e8f0;
  color: #2d3748;
}

.sweetness-badge.sweet {
  background-color: #fed7d7;
  color: #742a2a;
}

.rating {
  font-size: 0.85rem;
  font-weight: 600;
  color: #d69e2e;
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.status-badge.unopened {
  background-color: #e6fffa;
  color: #234e52;
}

.status-badge.opened {
  background-color: #fef3c7;
  color: #7c2d12;
}

.status-badge.finished {
  background-color: #e2e8f0;
  color: #1f2937;
}

.status-badge.unknown {
  background-color: #edf2f7;
  color: #4a5568;
}

.flavor-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.note-tag {
  background-color: #edf2f7;
  color: #4a5568;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}
</style>
