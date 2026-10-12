<script setup lang="ts">
import { AmaroBottle } from '../types/amaro';

const props = withDefaults(
  defineProps<{
    bottle: AmaroBottle;
    canEdit?: boolean;
  }>(),
  {
    canEdit: false,
  }
);

const emit = defineEmits<{
  (e: 'select', bottle: AmaroBottle): void;
  (e: 'edit', bottle: AmaroBottle): void;
  (e: 'delete', bottle: AmaroBottle): void;
}>();

const formatStatus = (status?: string): string => {
  if (!status) return 'Not Opened';
  switch (status) {
    case 'unopened': return 'Not Opened';
    case 'opened': return 'Opened';
    case 'finished': return 'Finished';
    default: return status;
  }
};

const handleCardClick = () => emit('select', props.bottle);
const handleEdit = (event: MouseEvent) => {
  event.stopPropagation();
  emit('edit', props.bottle);
};
const handleDelete = (event: MouseEvent) => {
  event.stopPropagation();
  emit('delete', props.bottle);
};
</script>

<template>
  <div
    class="amaro-card"
    role="button"
    tabindex="0"
    :aria-label="`View details for ${bottle.name}`"
    @click="handleCardClick"
    @keydown.enter="handleCardClick"
    @keydown.space.prevent="handleCardClick"
  >
    <div class="image-container">
      <img
        v-if="bottle.imageUrl"
        class="bottle-image"
        :src="bottle.imageUrl"
        :alt="`${bottle.name} bottle image`"
        loading="lazy"
      />
      <div v-else class="bottle-image-placeholder">
        <span class="placeholder-icon">🍾</span>
      </div>
    </div>

    <div class="card-content">
      <div class="header-section">
        <h3 class="bottle-name">{{ bottle.name }}</h3>
        <p class="producer">
          {{ bottle.producer }}
          <template v-if="bottle.region"> &bull; <span class="region">{{ bottle.region }}</span></template>
        </p>
      </div>

      <div class="meta-row">
        <span class="status-badge" :class="bottle.status || 'unopened'">
          {{ formatStatus(bottle.status) }}
        </span>

        <span v-if="typeof bottle.abv === 'number'" class="abv-badge">
          {{ bottle.abv }}% ABV
        </span>

        <span v-if="bottle.rating" class="rating">
          <span class="star">★</span> {{ bottle.rating }}/5
        </span>
      </div>

      <div v-if="canEdit" class="card-actions" @click.stop>
        <button type="button" class="edit-btn" @click="handleEdit">Edit</button>
        <button type="button" class="delete-btn" @click="handleDelete">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.amaro-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  user-select: none;
}

.amaro-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}

.amaro-card:focus-visible {
  outline: 2px solid #3182ce;
  outline-offset: 2px;
}

.image-container {
  width: 100%;
  height: 160px;
  background-color: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  overflow: hidden;
}

.bottle-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 0.5rem;
  box-sizing: border-box;
}

.bottle-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 2.25rem;
  opacity: 0.35;
}

.card-content {
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
  gap: 0.6rem;
}

.header-section {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.bottle-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #1a202c;
  line-height: 1.3;
}

.producer {
  margin: 0;
  font-size: 0.82rem;
  color: #718096;
}

.region {
  color: #4a5568;
  font-weight: 500;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.status-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
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

.abv-badge {
  background-color: #f7fafc;
  border: 1px solid #cbd5e0;
  color: #2d3748;
  font-weight: 600;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 5px;
  white-space: nowrap;
}

.rating {
  font-size: 0.78rem;
  font-weight: 600;
  color: #d69e2e;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-top: 0.25rem;
  padding-top: 0.4rem;
  border-top: 1px solid #f1f5f9;
}

.card-actions button {
  border: none;
  border-radius: 5px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.78rem;
}

.edit-btn {
  background: #e2e8f0;
  color: #1f2937;
}

.edit-btn:hover {
  background: #cbd5e1;
}

.delete-btn {
  background: #fee2e2;
  color: #991b1b;
}

.delete-btn:hover {
  background: #fecaca;
}
</style>
