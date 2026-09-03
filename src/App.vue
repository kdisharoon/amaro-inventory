<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAmaroStore } from './stores/amaroStore';
import AmaroFilterBar from './components/AmaroFilterBar.vue';
import AmaroCard from './components/AmaroCard.vue';
import AmaroForm from './components/AmaroForm.vue';

const amaroStore = useAmaroStore();
const showAddForm = ref(false);
const idToken = ref<string | null>(localStorage.getItem('amaro_google_id_token'));
const signedInEmail = ref<string | null>(localStorage.getItem('amaro_google_email'));

const googleClientId = window.__APP_CONFIG__?.GOOGLE_CLIENT_ID || '';
const adminEmail = (window.__APP_CONFIG__?.ADMIN_EMAIL || '').toLowerCase();

const isAuthorized = computed(() => {
  if (!adminEmail || !signedInEmail.value) return false;
  return signedInEmail.value.toLowerCase() === adminEmail;
});

const decodeJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const handleGoogleCredential = (response: { credential?: string }) => {
  if (!response?.credential) return;
  const payload = decodeJwtPayload(response.credential);
  const email = payload?.email as string | undefined;
  if (!email) return;

  idToken.value = response.credential;
  signedInEmail.value = email;
  localStorage.setItem('amaro_google_id_token', response.credential);
  localStorage.setItem('amaro_google_email', email);
};

const renderGoogleButton = () => {
  if (!window.google || !googleClientId) return;

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredential,
  });

  const target = document.getElementById('google-signin-button');
  if (target) {
    target.innerHTML = '';
    window.google.accounts.id.renderButton(target, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
    });
  }
};

const waitForGoogleAndRender = () => {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (window.google && googleClientId) {
      window.clearInterval(timer);
      renderGoogleButton();
    }
    if (attempts > 25) {
      window.clearInterval(timer);
    }
  }, 200);
};

const signOut = () => {
  idToken.value = null;
  signedInEmail.value = null;
  showAddForm.value = false;
  localStorage.removeItem('amaro_google_id_token');
  localStorage.removeItem('amaro_google_email');
  window.google?.accounts?.id?.disableAutoSelect?.();
};

onMounted(() => {
  amaroStore.fetchBottles();
  waitForGoogleAndRender();
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
      <section class="auth-panel">
        <div class="auth-copy">
          <h2>Add Bottle</h2>
          <p v-if="adminEmail">Only <strong>{{ adminEmail }}</strong> can add bottles.</p>
          <p v-else>Admin account is not configured yet.</p>
        </div>

        <div class="auth-actions">
          <template v-if="!idToken">
            <div id="google-signin-button"></div>
          </template>

          <template v-else>
            <p class="signed-in-as">Signed in as <strong>{{ signedInEmail }}</strong></p>
            <button class="toggle-add-btn" @click="showAddForm = !showAddForm" :disabled="!isAuthorized">
              {{ showAddForm ? 'Hide Add Form' : 'Add Bottle' }}
            </button>
            <button class="signout-btn" @click="signOut">Sign out</button>
            <p v-if="!isAuthorized" class="unauthorized-note">This account is not authorized to add bottles.</p>
          </template>
        </div>
      </section>

      <AmaroForm v-if="showAddForm && isAuthorized" :id-token="idToken" />

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

.auth-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.auth-copy h2 {
  margin: 0;
  font-size: 1.125rem;
}

.auth-copy p {
  margin: 0.25rem 0 0;
  color: #64748b;
}

.auth-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.signed-in-as {
  margin: 0;
  font-size: 0.9rem;
}

.toggle-add-btn,
.signout-btn {
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.toggle-add-btn {
  background: #2563eb;
  color: #fff;
}

.toggle-add-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.signout-btn {
  background: #e2e8f0;
  color: #1f2937;
}

.unauthorized-note {
  margin: 0;
  color: #b91c1c;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .auth-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .auth-actions {
    justify-content: flex-start;
  }
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