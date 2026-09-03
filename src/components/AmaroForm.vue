<script setup lang="ts">
import { ref } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import { amaroApiClient } from '../api/amaroClient';
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
const flavorNotes = ref(''); // comma-separated
const sweetnessLevel = ref<'not-specified' | 'dry' | 'semi-sweet' | 'sweet'>('not-specified');
const status = ref<'unopened' | 'opened' | 'finished'>('unopened');
const selectedImageFile = ref<File | null>(null);
const selectedImagePreviewUrl = ref('');
const selectedExternalImageUrl = ref('');
const imageSearchQuery = ref('');
const imageOptions = ref<Array<{ id: string; title: string; thumbUrl: string; fullUrl: string }>>([]);
const isSearchingImages = ref(false);
const isSubmitting = ref(false);
const error = ref<string | null>(null);
const imageSearchError = ref<string | null>(null);

const MAX_IMAGE_WIDTH = 1200;
const WEBP_QUALITY = 0.78;
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
  const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(img.width * scale));
  canvas.height = Math.max(1, Math.floor(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const toBlob = (quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to compress image.'));
          return;
        }
        resolve(blob);
      }, 'image/webp', quality);
    });

  let blob = await toBlob(WEBP_QUALITY);
  if (blob.size > MAX_UPLOAD_BYTES) {
    blob = await toBlob(0.65);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'bottle-image';
  return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
};

const setImageFromFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    error.value = null;
    const compressedFile = await compressImageToFile(file);
    selectedImageFile.value = compressedFile;
    selectedExternalImageUrl.value = '';
    selectedImagePreviewUrl.value = URL.createObjectURL(compressedFile);
  } catch (e: any) {
    error.value = e?.message || 'Failed to load image.';
  } finally {
    input.value = '';
  }
};

const clearImage = () => {
  selectedImageFile.value = null;
  selectedImagePreviewUrl.value = '';
  selectedExternalImageUrl.value = '';
};

const searchImages = async () => {
  const query = imageSearchQuery.value.trim() || name.value.trim();
  if (!query) {
    imageSearchError.value = 'Enter a bottle name to search for images.';
    return;
  }

  imageSearchError.value = null;
  isSearchingImages.value = true;
  imageOptions.value = [];

  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)} bottle&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json&origin=*`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`Image search failed (Status ${response.status})`);

    const data = await response.json() as {
      query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: Array<{ url?: string; thumburl?: string }> }> };
    };

    const pages = Object.values(data.query?.pages || {});
    imageOptions.value = pages
      .map((page) => {
        const imageInfo = page.imageinfo?.[0];
        const thumbUrl = imageInfo?.thumburl;
        const fullUrl = imageInfo?.url;
        if (!thumbUrl || !fullUrl) return null;
        return {
          id: String(page.pageid),
          title: page.title.replace(/^File:/, ''),
          thumbUrl,
          fullUrl,
        };
      })
      .filter((item): item is { id: string; title: string; thumbUrl: string; fullUrl: string } => Boolean(item));

    if (imageOptions.value.length === 0) {
      imageSearchError.value = 'No image results found. Try a more specific bottle name.';
    }
  } catch (e: any) {
    imageSearchError.value = e?.message || 'Failed to search images.';
  } finally {
    isSearchingImages.value = false;
  }
};

const selectSearchImage = (url: string) => {
  selectedImageFile.value = null;
  selectedExternalImageUrl.value = url;
  selectedImagePreviewUrl.value = url;
};

const uploadImageIfNeeded = async (): Promise<string | undefined> => {
  if (!props.idToken) {
    if (selectedImageFile.value || selectedExternalImageUrl.value) {
      throw new Error('Sign in is required before uploading an image.');
    }
    return undefined;
  }

  if (selectedImageFile.value) {
    const uploadTarget = await amaroApiClient.requestImageUploadUrl(
      props.idToken,
      selectedImageFile.value.type || 'image/webp',
      selectedImageFile.value.name
    );

    await amaroApiClient.uploadImageToS3(uploadTarget.uploadUrl, selectedImageFile.value);
    return uploadTarget.imageUrl;
  }

  if (selectedExternalImageUrl.value) {
    const imported = await amaroApiClient.importImageFromUrl(props.idToken, selectedExternalImageUrl.value);
    return imported.imageUrl;
  }

  return undefined;
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
  selectedExternalImageUrl.value = '';
  imageSearchQuery.value = '';
  imageOptions.value = [];
  imageSearchError.value = null;
};

const submit = async () => {
  error.value = null;
  if (!name.value || !producer.value || abv.value === null) {
    error.value = 'Please provide at least name, producer and ABV.';
    return;
  }

  isSubmitting.value = true;
  try {
    const uploadedImageUrl = await uploadImageIfNeeded();

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
      imageUrl: uploadedImageUrl,
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
    <div class="row">
      <input v-model="name" placeholder="Name" />
      <input v-model="producer" placeholder="Producer" />
    </div>

    <div class="row">
      <input v-model="region" placeholder="Region" />
      <input v-model.number="abv" type="number" min="0" max="100" placeholder="ABV %" />
    </div>

    <textarea v-model="description" placeholder="Description (optional)"></textarea>

    <input v-model="flavorNotes" placeholder="Flavor notes (comma-separated)" />

    <section class="image-section">
      <div class="image-section-header">Bottle Image (optional)</div>
      <div class="image-input-actions">
        <label class="image-action-btn" for="image-from-storage">Upload from device</label>
        <input id="image-from-storage" type="file" accept="image/*" @change="setImageFromFile" />

        <label class="image-action-btn" for="image-from-camera">Take photo (phone)</label>
        <input id="image-from-camera" type="file" accept="image/*" capture="environment" @change="setImageFromFile" />

        <button type="button" class="secondary-btn" @click="clearImage" :disabled="!selectedImagePreviewUrl">Clear image</button>
      </div>

      <div class="image-search-row">
        <input v-model="imageSearchQuery" placeholder="Search internet images (e.g. Averna bottle)" />
        <button type="button" class="secondary-btn" @click="searchImages" :disabled="isSearchingImages">
          {{ isSearchingImages ? 'Searching...' : 'Search Images' }}
        </button>
      </div>

      <p v-if="imageSearchError" class="form-error">{{ imageSearchError }}</p>

      <div v-if="imageOptions.length > 0" class="image-results-grid">
        <button
          v-for="option in imageOptions"
          :key="option.id"
          class="image-option"
          type="button"
          @click="selectSearchImage(option.fullUrl)"
          :title="option.title"
        >
          <img :src="option.thumbUrl" :alt="option.title" loading="lazy" />
          <span>{{ option.title }}</span>
        </button>
      </div>

      <div v-if="selectedImagePreviewUrl" class="image-preview">
        <div class="image-preview-label">Selected image preview</div>
        <img :src="selectedImagePreviewUrl" alt="Selected bottle image" />
      </div>
    </section>

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
.image-search-row { display: flex; gap: 0.5rem; }
.image-results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.5rem; }
.image-option { background: #fff !important; color: #1f2937 !important; border: 1px solid #cbd5e0 !important; display: flex; flex-direction: column; gap: 0.3rem; padding: 0.35rem !important; }
.image-option img { width: 100%; height: 90px; object-fit: cover; border-radius: 4px; }
.image-option span { font-size: 0.72rem; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-preview { border: 1px dashed #cbd5e0; border-radius: 8px; padding: 0.5rem; background: #fff; }
.image-preview-label { font-size: 0.78rem; color: #64748b; margin-bottom: 0.35rem; }
.image-preview img { width: 100%; max-height: 240px; object-fit: contain; border-radius: 6px; }

@media (max-width: 768px) {
  .amaro-form .row { flex-direction: column; }
  .image-search-row { flex-direction: column; }
}
</style>
