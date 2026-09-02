<script setup lang="ts">
import { ref } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import type { CreateAmaroBottlePayload } from '../types/amaro';

const amaroStore = useAmaroStore();

const name = ref('');
const producer = ref('');
const region = ref('');
const abv = ref<number | null>(null);
const description = ref('');
const flavorNotes = ref(''); // comma-separated
const sweetnessLevel = ref<'bone-dry' | 'dry' | 'semi-sweet' | 'sweet'>('dry');
const isSubmitting = ref(false);
const error = ref<string | null>(null);

const resetForm = () => {
  name.value = '';
  producer.value = '';
  region.value = '';
  abv.value = null;
  description.value = '';
  flavorNotes.value = '';
  sweetnessLevel.value = 'dry';
};

const submit = async () => {
  error.value = null;
  if (!name.value || !producer.value || abv.value === null) {
    error.value = 'Please provide at least name, producer and ABV.';
    return;
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
  };

  isSubmitting.value = true;
  try {
    const created = await amaroStore.addBottle(payload);
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

    <div class="row">
      <label>Sweetness</label>
      <select v-model="sweetnessLevel">
        <option value="bone-dry">Bone-dry</option>
        <option value="dry">Dry</option>
        <option value="semi-sweet">Semi-sweet</option>
        <option value="sweet">Sweet</option>
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
</style>
