<script setup lang="ts">
import { ref } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import { amaroApiClient, type BottleImageAnalysisResult } from '../api/amaroClient';
import type { CreateAmaroBottlePayload } from '../types/amaro';

const props = defineProps<{
  idToken?: string | null;
}>();

const amaroStore = useAmaroStore();

const name = ref('');
const producer = ref('');
const region = ref('');
const abv = ref<number | null>(null);
const description = ref('');
const flavorNotes = ref('');
const sweetnessLevel = ref<'not-specified' | 'dry' | 'semi-sweet' | 'sweet'>('not-specified');
const status = ref<'unopened' | 'opened' | 'finished'>('unopened');

const selectedImageFile = ref<File | null>(null);
const selectedImagePreviewUrl = ref('');
const uploadedImageUrl = ref('');

const isAnalyzingImage = ref(false);
const analysisMessage = ref('');
const analysisError = ref<string | null>(null);
const descriptionConfidence = ref<'low' | 'medium' | 'high' | null>(null);
const flavorNotesConfidence = ref<'low' | 'medium' | 'high' | null>(null);
const descriptionNeedsReview = ref(false);
const flavorNotesNeedsReview = ref(false);

const isSubmitting = ref(false);
const error = ref<string | null>(null);

const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 300 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to process image.'));
    img.src = src;
  });

const compressImageToFile = async (file: File): Promise<File> => {
  const sourceDataUrl = await readAsDataUrl(file);
  const img = await loadImage(sourceDataUrl);
  let scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('This browser cannot resize images.');
  }

  const toBlob = (quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to compress image.'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    });

  const render = () => {
    canvas.width = Math.max(1, Math.floor(img.width * scale));
    canvas.height = Math.max(1, Math.floor(img.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  render();
  let blob = await toBlob(JPEG_QUALITY);
  if (blob.size > MAX_UPLOAD_BYTES) {
    blob = await toBlob(0.65);
  }

  let attempts = 0;
  while (blob.size > MAX_UPLOAD_BYTES && attempts < 5) {
    attempts += 1;
    scale *= 0.85;
    render();
    blob = await toBlob(0.65);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'bottle-image';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
};

const resetAnalysisSignals = () => {
  analysisError.value = null;
  descriptionConfidence.value = null;
  flavorNotesConfidence.value = null;
  descriptionNeedsReview.value = false;
  flavorNotesNeedsReview.value = false;
};

const applyAnalysis = (analysis: BottleImageAnalysisResult) => {
  if (analysis.name) name.value = analysis.name;
  if (analysis.producer) producer.value = analysis.producer;
  if (analysis.region) region.value = analysis.region;
  if (typeof analysis.abv === 'number') abv.value = analysis.abv;
  if (analysis.description) description.value = analysis.description;
  if (Array.isArray(analysis.flavorNotes) && analysis.flavorNotes.length > 0) {
    flavorNotes.value = analysis.flavorNotes.join(', ');
  }
  if (analysis.sweetnessLevel) sweetnessLevel.value = analysis.sweetnessLevel;

  descriptionConfidence.value = analysis.descriptionConfidence || null;
  flavorNotesConfidence.value = analysis.flavorNotesConfidence || null;
  descriptionNeedsReview.value = Boolean(analysis.descriptionNeedsReview);
  flavorNotesNeedsReview.value = Boolean(analysis.flavorNotesNeedsReview);
};

const uploadSelectedImage = async (): Promise<string> => {
  if (!props.idToken) {
    throw new Error('Sign in is required before uploading and analyzing an image.');
  }
  if (!selectedImageFile.value) {
    throw new Error('No image selected.');
  }

  const uploadTarget = await amaroApiClient.requestImageUploadUrl(
    props.idToken,
    selectedImageFile.value.type || 'image/jpeg',
    selectedImageFile.value.name
  );

  await amaroApiClient.uploadImageToS3(uploadTarget.uploadUrl, selectedImageFile.value);
  uploadedImageUrl.value = uploadTarget.imageUrl;
  return uploadTarget.imageUrl;
};

const analyzeImageInBackground = async () => {
  if (!selectedImageFile.value) return;

  isAnalyzingImage.value = true;
  analysisMessage.value = 'Working... reading the label and preparing draft details.';
  resetAnalysisSignals();

  try {
    const imageUrl = await uploadSelectedImage();
    const analysis = await amaroApiClient.analyzeBottleImage(props.idToken || '', imageUrl);
    applyAnalysis(analysis);
    analysisMessage.value = 'Draft fields are ready. Please review description and flavor notes.';
  } catch (e: any) {
    analysisError.value = e?.message || 'Image analysis failed.';
    analysisMessage.value = '';
  } finally {
    isAnalyzingImage.value = false;
  }
};

const setImageFromFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    error.value = null;
    const compressedFile = await compressImageToFile(file);
    selectedImageFile.value = compressedFile;
    uploadedImageUrl.value = '';
    selectedImagePreviewUrl.value = URL.createObjectURL(compressedFile);
    await analyzeImageInBackground();
  } catch (e: any) {
    error.value = e?.message || 'Failed to load image.';
  } finally {
    input.value = '';
  }
};

const clearImage = () => {
  selectedImageFile.value = null;
  selectedImagePreviewUrl.value = '';
  uploadedImageUrl.value = '';
  analysisMessage.value = '';
  resetAnalysisSignals();
};

const resetForm = () => {
  name.value = '';
  producer.value = '';
  region.value = '';
  abv.value = null;
  description.value = '';
  flavorNotes.value = '';
  sweetnessLevel.value = 'not-specified';
  status.value = 'unopened';
  selectedImageFile.value = null;
  selectedImagePreviewUrl.value = '';
  uploadedImageUrl.value = '';
  analysisMessage.value = '';
  resetAnalysisSignals();
};

const submit = async () => {
  error.value = null;
  if (!name.value || !producer.value || abv.value === null) {
    error.value = 'Please provide at least name, producer and ABV.';
    return;
  }

  isSubmitting.value = true;
  try {
    if (selectedImageFile.value && !uploadedImageUrl.value) {
      await uploadSelectedImage();
    }

    const payload: CreateAmaroBottlePayload = {
      name: name.value,
      producer: producer.value,
      region: region.value,
      abv: abv.value,
      description: description.value,
      flavorNotes: flavorNotes.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      sweetnessLevel: sweetnessLevel.value,
      status: status.value,
      imageUrl: uploadedImageUrl.value || undefined,
    };

    const created = await amaroStore.addBottle(payload, props.idToken || undefined);
    if (created) resetForm();
  } catch (e: any) {
    error.value = e?.message || 'Failed to add bottle.';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <form class="amaro-form" @submit.prevent="submit">
    <section class="image-section">
      <div class="image-section-header">Bottle Image</div>
      <div class="image-input-actions">
        <label class="image-action-btn" for="image-from-storage">Upload from device</label>
        <input id="image-from-storage" type="file" accept="image/*" @change="setImageFromFile" />

        <label class="image-action-btn" for="image-from-camera">Take photo (phone)</label>
        <input id="image-from-camera" type="file" accept="image/*" capture="environment" @change="setImageFromFile" />

        <button type="button" class="secondary-btn" @click="clearImage" :disabled="!selectedImagePreviewUrl">Clear image</button>
      </div>

      <div v-if="isAnalyzingImage" class="analysis-status">
        <span class="spinner-sm" aria-hidden="true"></span>
        <span>Working... {{ analysisMessage }}</span>
      </div>
      <p v-else-if="analysisMessage" class="analysis-done">{{ analysisMessage }}</p>
      <p v-if="analysisError" class="form-error">{{ analysisError }}</p>

      <div v-if="selectedImagePreviewUrl" class="image-preview">
        <div class="image-preview-label">Selected image preview</div>
        <img :src="selectedImagePreviewUrl" alt="Selected bottle image" />
      </div>
    </section>

    <div class="row">
      <input v-model="name" placeholder="Name" />
      <input v-model="producer" placeholder="Producer" />
    </div>

    <div class="row">
      <input v-model="region" placeholder="Region" />
      <input v-model.number="abv" type="number" min="0" max="100" placeholder="ABV %" />
    </div>

    <div class="field-group">
      <div class="field-header">
        <label for="description-input">Description</label>
        <span v-if="descriptionConfidence" :class="['confidence-badge', descriptionConfidence]">{{ descriptionConfidence }} confidence</span>
        <span v-if="descriptionNeedsReview" class="review-flag">Needs review</span>
      </div>
      <textarea id="description-input" v-model="description" placeholder="Description (optional)"></textarea>
    </div>

    <div class="field-group">
      <div class="field-header">
        <label for="flavor-notes-input">Flavor notes</label>
        <span v-if="flavorNotesConfidence" :class="['confidence-badge', flavorNotesConfidence]">{{ flavorNotesConfidence }} confidence</span>
        <span v-if="flavorNotesNeedsReview" class="review-flag">Needs review</span>
      </div>
      <input id="flavor-notes-input" v-model="flavorNotes" placeholder="Flavor notes (comma-separated)" />
    </div>

    <div class="row">
      <label>Sweetness</label>
      <select v-model="sweetnessLevel">
        <option value="not-specified">Not specified</option>
        <option value="dry">Dry</option>
        <option value="semi-sweet">Semi-sweet</option>
        <option value="sweet">Sweet</option>
      </select>
      <label>Status</label>
      <select v-model="status">
        <option value="unopened">Not Opened</option>
        <option value="opened">Opened</option>
        <option value="finished">Finished</option>
      </select>
      <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Saving...' : 'Add Bottle' }}</button>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
  </form>
</template>

<style scoped>
.amaro-form { background: #fff; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; display:flex; flex-direction:column; gap:0.75rem }
.amaro-form .row { display:flex; gap:0.5rem }
.amaro-form input, .amaro-form select, .amaro-form textarea { padding:0.5rem; border:1px solid #cbd5e0; border-radius:6px; flex:1 }
.amaro-form button { background:#3182ce; color:#fff; border:none; padding:0.5rem 0.75rem; border-radius:6px; cursor:pointer }
.form-error { color:#e53e3e; font-size:0.9rem }

.image-section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; background: #f8fafc; display: flex; flex-direction: column; gap: 0.75rem; }
.image-section-header { font-weight: 600; font-size: 0.92rem; color: #334155; }
.image-input-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.image-input-actions input[type='file'] { display: none; }
.image-action-btn { background: #e2e8f0; color: #1f2937; border-radius: 6px; padding: 0.45rem 0.7rem; font-size: 0.86rem; cursor: pointer; }
.secondary-btn { background: #e2e8f0 !important; color: #1f2937 !important; }
.secondary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.image-preview { border: 1px dashed #cbd5e0; border-radius: 8px; padding: 0.5rem; background: #fff; }
.image-preview-label { font-size: 0.78rem; color: #64748b; margin-bottom: 0.35rem; }
.image-preview img { width: 100%; max-height: 240px; object-fit: contain; border-radius: 6px; }
.analysis-status { display: inline-flex; align-items: center; gap: 0.5rem; color: #334155; font-size: 0.87rem; }
.analysis-done { color: #1e293b; margin: 0; font-size: 0.87rem; }
.spinner-sm { width: 14px; height: 14px; border: 2px solid #cbd5e0; border-top-color: #2563eb; border-radius: 50%; animation: spin-sm 0.8s linear infinite; }
.field-group { display: flex; flex-direction: column; gap: 0.4rem; }
.field-header { display: flex; align-items: center; gap: 0.4rem; color: #334155; font-size: 0.84rem; }
.confidence-badge { padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize; }
.confidence-badge.high { background: #dcfce7; color: #166534; }
.confidence-badge.medium { background: #fef3c7; color: #92400e; }
.confidence-badge.low { background: #fee2e2; color: #991b1b; }
.review-flag { padding: 0.1rem 0.45rem; border-radius: 999px; background: #fee2e2; color: #991b1b; font-size: 0.72rem; font-weight: 600; }

@keyframes spin-sm {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .amaro-form .row { flex-direction: column; }
}
</style>
