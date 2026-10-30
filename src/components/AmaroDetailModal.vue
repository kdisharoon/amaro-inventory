<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import type { AmaroBottle } from '../types/amaro';

const props = withDefaults(
  defineProps<{
    bottle: AmaroBottle;
    canEdit?: boolean;
    isLoggedIn?: boolean;
    idToken?: string | null;
  }>(),
  {
    canEdit: false,
    isLoggedIn: false,
    idToken: null,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', bottle: AmaroBottle): void;
  (e: 'delete', bottle: AmaroBottle): void;
}>();

const amaroStore = useAmaroStore();
const userRating = computed(() => amaroStore.getUserRating(props.bottle.id));

const selectedScore = ref<number | null>(null);
const tastingNotes = ref<string>('');
const hoveredScore = ref<number | null>(null);
const isSaving = ref<boolean>(false);
const saveSuccessMessage = ref<string>('');
const ratingError = ref<string | null>(null);

const hydrateRatingForm = () => {
  selectedScore.value = userRating.value?.score ?? null;
  tastingNotes.value = userRating.value?.notes ?? '';
  hoveredScore.value = null;
  saveSuccessMessage.value = '';
  ratingError.value = null;
};

watch(
  () => [userRating.value, props.bottle.id],
  () => {
    hydrateRatingForm();
  },
  { immediate: true }
);

const hasChanges = computed(() => {
  const currentScore = userRating.value?.score ?? null;
  const currentNotes = (userRating.value?.notes ?? '').trim();
  const inputNotes = tastingNotes.value.trim();

  if (selectedScore.value === null) return false;
  return selectedScore.value !== currentScore || inputNotes !== currentNotes;
});

const handleScoreSelect = (val: number) => {
  selectedScore.value = val;
  ratingError.value = null;
};

const handleSaveRating = async () => {
  if (!props.idToken || !selectedScore.value) return;
  isSaving.value = true;
  ratingError.value = null;
  saveSuccessMessage.value = '';

  try {
    await amaroStore.setUserRating(props.idToken, props.bottle.id, {
      score: selectedScore.value,
      notes: tastingNotes.value.trim(),
    });
    saveSuccessMessage.value = 'Your rating has been saved!';
    setTimeout(() => {
      saveSuccessMessage.value = '';
    }, 3500);
  } catch (err: any) {
    ratingError.value = err?.message || 'Failed to save rating. Please try again.';
  } finally {
    isSaving.value = false;
  }
};

const handleRemoveRating = async () => {
  if (!props.idToken || !userRating.value) return;
  const confirm = window.confirm(`Remove your rating for ${props.bottle.name}?`);
  if (!confirm) return;

  isSaving.value = true;
  ratingError.value = null;
  saveSuccessMessage.value = '';

  try {
    await amaroStore.deleteUserRating(props.idToken, props.bottle.id);
    selectedScore.value = null;
    tastingNotes.value = '';
    saveSuccessMessage.value = 'Your rating has been removed.';
    setTimeout(() => {
      saveSuccessMessage.value = '';
    }, 3500);
  } catch (err: any) {
    ratingError.value = err?.message || 'Failed to remove rating. Please try again.';
  } finally {
    isSaving.value = false;
  }
};

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
          <span v-if="isLoggedIn && userRating" class="user-rating-pill" title="Your Rating">
            <span class="star">★</span> {{ userRating.score }}/10
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

          <!-- "Your Rating" section: Visible ONLY to logged-in users -->
          <section v-if="isLoggedIn" class="detail-section your-rating-section">
            <div class="rating-header-row">
              <div class="title-with-badge">
                <h4 class="section-title">Your Rating</h4>
                <span v-if="userRating" class="status-indicator-badge rated">
                  ★ {{ userRating.score }}/10
                </span>
                <span v-else class="status-indicator-badge unrated">
                  Unrated
                </span>
              </div>
              <div v-if="hoveredScore !== null || selectedScore !== null" class="score-display">
                <span class="score-number">{{ hoveredScore ?? selectedScore }}</span>
                <span class="score-max">/ 10</span>
              </div>
            </div>

            <!-- 1 to 10 Scale Buttons -->
            <div class="scale-wrapper">
              <div class="scale-bar" role="radiogroup" aria-label="Rate this amaro on a scale of 1 to 10">
                <button
                  v-for="score in 10"
                  :key="score"
                  type="button"
                  role="radio"
                  :aria-checked="selectedScore === score"
                  :aria-label="`Score ${score} out of 10`"
                  class="scale-btn"
                  :class="{
                    selected: selectedScore === score,
                    hovered: hoveredScore !== null && score <= hoveredScore,
                  }"
                  @click="handleScoreSelect(score)"
                  @mouseenter="hoveredScore = score"
                  @mouseleave="hoveredScore = null"
                >
                  {{ score }}
                </button>
              </div>
              <div class="scale-hint-row">
                <span class="scale-hint">1 (Poor)</span>
                <span class="scale-hint">10 (Exceptional)</span>
              </div>
            </div>

            <!-- Freeform Tasting Notes / Opinion -->
            <div class="notes-wrapper">
              <div class="notes-header-row">
                <label for="user-rating-notes" class="notes-label">Tasting Notes &amp; Opinion</label>
                <span
                  class="char-counter"
                  :class="{ 'char-warning': tastingNotes.length >= 240, 'char-max': tastingNotes.length >= 250 }"
                >
                  {{ tastingNotes.length }}/250
                </span>
              </div>
              <textarea
                id="user-rating-notes"
                v-model="tastingNotes"
                maxlength="250"
                rows="3"
                class="notes-input"
                placeholder="Add your personal tasting notes, botanical impressions, or serving opinion..."
              ></textarea>
            </div>

            <!-- Actions and Feedback -->
            <div class="rating-footer-row">
              <div class="feedback-area">
                <span v-if="saveSuccessMessage" class="feedback-success">
                  ✓ {{ saveSuccessMessage }}
                </span>
                <span v-else-if="ratingError" class="feedback-error">
                  {{ ratingError }}
                </span>
              </div>

              <div class="rating-btn-group">
                <button
                  v-if="userRating"
                  type="button"
                  class="remove-rating-btn"
                  :disabled="isSaving"
                  @click="handleRemoveRating"
                >
                  Remove Rating
                </button>
                <button
                  type="button"
                  class="save-rating-btn"
                  :disabled="!selectedScore || isSaving || !hasChanges"
                  @click="handleSaveRating"
                >
                  <span v-if="isSaving" class="spinner-xs"></span>
                  {{ isSaving ? 'Saving...' : (userRating ? 'Update Rating' : 'Save Rating') }}
                </button>
              </div>
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

.user-rating-pill {
  font-size: 0.8rem;
  font-weight: 700;
  color: #92400e;
  background-color: #fef3c7;
  border: 1px solid #fde68a;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.user-rating-pill .star {
  color: #d97706;
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

.date-added {
  font-size: 0.78rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.your-rating-section {
  background: #fdfbf7;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 1.1rem;
  gap: 0.85rem;
}

.rating-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.status-indicator-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.status-indicator-badge.rated {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.status-indicator-badge.unrated {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.score-display {
  display: inline-flex;
  align-items: baseline;
  background: #ffffff;
  border: 1px solid #fed7aa;
  padding: 0.15rem 0.6rem;
  border-radius: 6px;
}

.score-number {
  font-size: 1.15rem;
  font-weight: 800;
  color: #b45309;
}

.score-max {
  font-size: 0.75rem;
  color: #9a3412;
  margin-left: 0.2rem;
  font-weight: 600;
}

.scale-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.scale-bar {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}

.scale-btn {
  height: 36px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.92rem;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scale-btn:hover,
.scale-btn.hovered {
  background: #fffbeb;
  border-color: #f59e0b;
  color: #b45309;
}

.scale-btn.selected {
  background: #d97706;
  border-color: #b45309;
  color: #ffffff;
  font-weight: 800;
  box-shadow: 0 2px 4px rgba(217, 119, 6, 0.35);
  transform: translateY(-1px);
}

.scale-hint-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #94a3b8;
  padding: 0 0.15rem;
}

.notes-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.notes-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notes-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}

.char-counter {
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 500;
}

.char-counter.char-warning {
  color: #ea580c;
  font-weight: 600;
}

.char-counter.char-max {
  color: #dc2626;
  font-weight: 700;
}

.notes-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  font-size: 0.88rem;
  line-height: 1.45;
  color: #1e293b;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  resize: vertical;
  min-height: 68px;
  max-height: 140px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.notes-input:focus {
  border-color: #d97706;
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.15);
}

.notes-input::placeholder {
  color: #94a3b8;
}

.rating-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.2rem;
}

.feedback-area {
  flex: 1;
  min-height: 20px;
  font-size: 0.8rem;
}

.feedback-success {
  color: #15803d;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
}

.feedback-error {
  color: #b91c1c;
  font-weight: 600;
}

.rating-btn-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.remove-rating-btn {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #64748b;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.remove-rating-btn:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.save-rating-btn {
  background: #d97706;
  border: none;
  color: #ffffff;
  padding: 0.45rem 0.95rem;
  font-size: 0.82rem;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: background-color 0.15s, opacity 0.15s;
}

.save-rating-btn:hover:not(:disabled) {
  background: #b45309;
}

.save-rating-btn:disabled {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
  opacity: 0.75;
}

.spinner-xs {
  width: 12px;
  height: 12px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
