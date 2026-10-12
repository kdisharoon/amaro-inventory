<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { AmaroBottle } from '../types/amaro';

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
  (e: 'close'): void;
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

const formatDate = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-dialog" role="dialog" aria-modal="true" :aria-label="bottle.name">
      <button type="button" class="close-btn" aria-label="Close dialog" @click="emit('close')">
        &times;
      </button>

      <div class="modal-header">
        <h2 class="modal-title">{{ bottle.name }}</h2>
        <p class="modal-producer">
          {{ bottle.producer }}
          <template v-if="bottle.region"> &bull; <span class="region">{{ bottle.region }}</span></template>
        </p>

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
      </div>

      <div class="modal-body">
        <div class="modal-image-container">
          <img
            v-if="bottle.imageUrl"
            class="modal-image"
            :src="bottle.imageUrl"
            :alt="`${bottle.name} bottle image`"
          />
          <div v-else class="image-placeholder">
            <span class="placeholder-icon">🍾</span>
          </div>
        </div>

        <div class="modal-details">
          <section v-if="bottle.description" class="detail-section">
            <h4 class="section-title">Description &amp; Profile</h4>
            <p class="description-text">{{ bottle.description }}</p>
          </section>

          <section v-if="bottle.flavorNotes && bottle.flavorNotes.length > 0" class="detail-section">
            <h4 class="section-title">Tasting Notes &amp; Botanicals</h4>
            <div class="flavor-notes">
              <span v-for="note in bottle.flavorNotes" :key="note" class="note-tag">
                {{ note }}
              </span>
            </div>
          </section>

          <section v-if="bottle.dateAdded" class="date-added">
            Added to collection: {{ formatDate(bottle.dateAdded) }}
          </section>
        </div>
      </div>

      <div class="modal-footer">
        <div v-if="canEdit" class="admin-actions">
          <button type="button" class="edit-btn" @click="emit('edit', bottle)">Edit</button>
          <button type="button" class="delete-btn" @click="emit('delete', bottle)">Delete</button>
        </div>
        <button type="button" class="close-modal-btn" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  box-sizing: border-box;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  animation: modalEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 34px;
  height: 34px;
  font-size: 1.4rem;
  line-height: 1;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, color 0.15s;
  z-index: 2;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.modal-header {
  padding: 1.5rem 1.5rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.modal-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  padding-right: 2rem;
}

.modal-producer {
  margin: 0.35rem 0 0.75rem;
  font-size: 0.95rem;
  color: #64748b;
}

.region {
  color: #334155;
  font-weight: 500;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
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
  background-color: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-weight: 600;
  font-size: 0.8rem;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
}

.rating {
  font-size: 0.9rem;
  font-weight: 600;
  color: #d97706;
}

.modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal-image-container {
  width: 100%;
  max-height: 280px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-image {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
}

.image-placeholder {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 3.5rem;
  opacity: 0.35;
}

.modal-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.section-title {
  margin: 0;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 700;
}

.description-text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: #334155;
}

.flavor-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.note-tag {
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
}

.date-added {
  font-size: 0.78rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fafafa;
}

.admin-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn,
.delete-btn,
.close-modal-btn {
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.edit-btn {
  background: #e2e8f0;
  color: #1e293b;
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

.close-modal-btn {
  margin-left: auto;
  background: #3182ce;
  color: #ffffff;
}

.close-modal-btn:hover {
  background: #2b6cb0;
}
</style>
