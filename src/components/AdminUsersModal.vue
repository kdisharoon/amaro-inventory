<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAmaroStore } from '../stores/amaroStore';
import type { UserProfile } from '../types/amaro';

const props = defineProps<{
  idToken: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const amaroStore = useAmaroStore();

const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'blocked'>('all');
const isExpandingCapacity = ref(false);
const processingEmail = ref<string | null>(null);
const feedbackMessage = ref('');
const errorMessage = ref('');

const totalUsers = computed(() => amaroStore.adminUsersList.length);
const maxUsers = computed(() => amaroStore.maxUsers || 10);
const capacityPercentage = computed(() => {
  if (maxUsers.value <= 0) return 100;
  return Math.min(100, Math.round((totalUsers.value / maxUsers.value) * 100));
});

const isAtCapacity = computed(() => totalUsers.value >= maxUsers.value);

const filteredUsers = computed(() => {
  return amaroStore.adminUsersList.filter((user) => {
    if (statusFilter.value !== 'all' && user.status !== statusFilter.value) {
      return false;
    }
    if (searchQuery.value.trim() !== '') {
      const q = searchQuery.value.toLowerCase();
      const matchName = user.name?.toLowerCase().includes(q) ?? false;
      const matchEmail = user.email.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    return true;
  });
});

const setFeedback = (msg: string) => {
  feedbackMessage.value = msg;
  errorMessage.value = '';
  setTimeout(() => {
    if (feedbackMessage.value === msg) {
      feedbackMessage.value = '';
    }
  }, 4000);
};

const setError = (msg: string) => {
  errorMessage.value = msg;
  feedbackMessage.value = '';
};

const formatDate = (isoString?: string): string => {
  if (!isoString) return '—';
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

const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

const handleExpandCapacity = async () => {
  if (!props.idToken || isExpandingCapacity.value) return;
  isExpandingCapacity.value = true;
  errorMessage.value = '';
  try {
    await amaroStore.expandCapacity(props.idToken, 10);
    setFeedback(`Success! User capacity increased to ${amaroStore.maxUsers} allowed accounts.`);
  } catch (err: any) {
    setError(err?.message || 'Failed to expand capacity.');
  } finally {
    isExpandingCapacity.value = false;
  }
};

const handleToggleStatus = async (user: UserProfile) => {
  if (!props.idToken || processingEmail.value) return;
  const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
  const actionLabel = newStatus === 'blocked' ? 'block' : 'unblock';

  const confirmed = window.confirm(
    `Are you sure you want to ${actionLabel} ${user.name || user.email}?` +
    (newStatus === 'blocked'
      ? ' They will be immediately prevented from rating bottles or modifying their list.'
      : ' They will regain access to their personal ratings list.')
  );

  if (!confirmed) return;

  processingEmail.value = user.email;
  errorMessage.value = '';
  try {
    await amaroStore.updateUserStatus(props.idToken, user.email, newStatus);
    setFeedback(`User ${user.email} is now ${newStatus}.`);
  } catch (err: any) {
    setError(err?.message || `Failed to ${actionLabel} user.`);
  } finally {
    processingEmail.value = null;
  }
};

const handleDeleteUser = async (user: UserProfile) => {
  if (!props.idToken || processingEmail.value) return;

  const confirmed = window.confirm(
    `PERMANENT ACTION: Delete user ${user.name || user.email}?\n\n` +
    `This will permanently delete their account and purge all their personal amaro ratings. This cannot be undone.`
  );

  if (!confirmed) return;

  processingEmail.value = user.email;
  errorMessage.value = '';
  try {
    await amaroStore.deleteUser(props.idToken, user.email);
    setFeedback(`User ${user.email} and all associated ratings have been permanently deleted.`);
  } catch (err: any) {
    setError(err?.message || 'Failed to delete user.');
  } finally {
    processingEmail.value = null;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  if (props.idToken) {
    amaroStore.fetchAdminUsers(props.idToken);
  }
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
    <div class="fullscreen-dialog" role="dialog" aria-modal="true" aria-label="User Management">
      <!-- Modal Header -->
      <header class="dialog-header">
        <div class="header-titles">
          <div class="badge-title-row">
            <h2 class="dialog-title">User Management</h2>
            <span class="admin-pill">Admin Only</span>
          </div>
          <p class="dialog-subtitle">
            Manage user accounts, monitor registration quotas, and approve additional user capacity.
          </p>
        </div>

        <button type="button" class="close-btn" aria-label="Close dialog" @click="emit('close')">
          &times;
        </button>
      </header>

      <!-- Feedback notifications -->
      <div v-if="feedbackMessage" class="banner-feedback success">
        <span>✓ {{ feedbackMessage }}</span>
      </div>
      <div v-if="errorMessage || amaroStore.adminUsersError" class="banner-feedback error">
        <span>⚠ {{ errorMessage || amaroStore.adminUsersError }}</span>
      </div>

      <!-- Modal Body -->
      <div class="dialog-body">
        <!-- Capacity / Quota Panel -->
        <section class="capacity-card">
          <div class="capacity-info">
            <div class="capacity-title-row">
              <span class="capacity-label">Current User Capacity &amp; Quota</span>
              <span class="capacity-fraction">
                <strong>{{ totalUsers }}</strong> of <strong>{{ maxUsers }}</strong> Accounts
              </span>
            </div>

            <div class="progress-bar-container">
              <div
                class="progress-bar-fill"
                :class="{ 'near-limit': capacityPercentage >= 80, 'at-limit': isAtCapacity }"
                :style="{ width: `${capacityPercentage}%` }"
              ></div>
            </div>

            <p class="capacity-description">
              <template v-if="isAtCapacity">
                <strong class="warning-text">Cap reached!</strong> New sign-ins are paused with an alert sent to kdisharoon@gmail.com.
              </template>
              <template v-else>
                {{ maxUsers - totalUsers }} slots remaining before automated email notification fires at {{ maxUsers }} users.
              </template>
            </p>
          </div>

          <div class="capacity-action">
            <button
              type="button"
              class="expand-capacity-btn"
              :disabled="isExpandingCapacity"
              @click="handleExpandCapacity"
            >
              <span v-if="isExpandingCapacity" class="btn-spinner"></span>
              <span v-else>+</span>
              <span>Approve +10 Spaces</span>
            </button>
          </div>
        </section>

        <!-- User Controls Toolbar -->
        <div class="toolbar-row">
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search users by name or email..."
              class="search-input"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="clear-search"
              @click="searchQuery = ''"
            >
              &times;
            </button>
          </div>

          <div class="filter-pills">
            <button
              type="button"
              class="filter-pill"
              :class="{ active: statusFilter === 'all' }"
              @click="statusFilter = 'all'"
            >
              All ({{ totalUsers }})
            </button>
            <button
              type="button"
              class="filter-pill"
              :class="{ active: statusFilter === 'active' }"
              @click="statusFilter = 'active'"
            >
              Active
            </button>
            <button
              type="button"
              class="filter-pill"
              :class="{ active: statusFilter === 'blocked' }"
              @click="statusFilter = 'blocked'"
            >
              Blocked
            </button>
          </div>
        </div>

        <!-- Users Table or Empty State -->
        <div v-if="amaroStore.adminUsersLoading" class="loading-state">
          <div class="spinner"></div>
          <p>Loading registered users...</p>
        </div>

        <div v-else-if="filteredUsers.length === 0" class="empty-state">
          <p v-if="searchQuery || statusFilter !== 'all'">No users match your search or filter.</p>
          <p v-else>No registered users found.</p>
        </div>

        <div v-else class="table-container">
          <table class="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Role</th>
                <th>Ratings</th>
                <th>Joined</th>
                <th>Last Active</th>
                <th class="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="user in filteredUsers"
                :key="user.id"
                :class="{ 'blocked-row': user.status === 'blocked', 'admin-row': user.role === 'admin' }"
              >
                <!-- User Profile Column -->
                <td class="user-cell">
                  <div class="avatar-container">
                    <img
                      v-if="user.picture"
                      :src="user.picture"
                      :alt="user.name || user.email"
                      class="avatar-img"
                    />
                    <div v-else class="avatar-placeholder">
                      {{ (user.name || user.email).charAt(0).toUpperCase() }}
                    </div>
                  </div>
                  <div class="user-info">
                    <span class="user-name">{{ user.name || 'Anonymous User' }}</span>
                    <span class="user-email">{{ user.email }}</span>
                  </div>
                </td>

                <!-- Status Badge -->
                <td>
                  <span class="status-badge" :class="user.status">
                    {{ user.status === 'active' ? 'Active' : 'Blocked' }}
                  </span>
                </td>

                <!-- Role Badge -->
                <td>
                  <span class="role-badge" :class="user.role">
                    {{ user.role === 'admin' ? 'Owner / Admin' : 'Member' }}
                  </span>
                </td>

                <!-- Ratings Count -->
                <td class="ratings-cell">
                  <span class="ratings-pill" title="Total rated bottles">
                    ★ {{ user.ratingsCount ?? 0 }}
                  </span>
                </td>

                <!-- Joined Date -->
                <td class="date-cell">
                  {{ formatDate(user.createdAt) }}
                </td>

                <!-- Last Active Date -->
                <td class="date-cell">
                  {{ formatDateTime(user.lastLoginAt) }}
                </td>

                <!-- Actions -->
                <td class="actions-cell">
                  <template v-if="user.role === 'admin'">
                    <span class="protected-pill" title="Primary admin account cannot be modified">
                      Protected
                    </span>
                  </template>
                  <template v-else>
                    <div class="action-buttons">
                      <button
                        type="button"
                        class="block-btn"
                        :class="{ 'is-blocked': user.status === 'blocked' }"
                        :disabled="processingEmail === user.email"
                        @click="handleToggleStatus(user)"
                      >
                        {{ user.status === 'blocked' ? 'Unblock' : 'Block' }}
                      </button>

                      <button
                        type="button"
                        class="delete-btn"
                        :disabled="processingEmail === user.email"
                        title="Delete user and all their ratings"
                        @click="handleDeleteUser(user)"
                      >
                        Delete 🗑️
                      </button>
                    </div>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Footer -->
      <footer class="dialog-footer">
        <span class="footer-note">
          🔒 Blocked users are immediately prevented from accessing or submitting ratings. Deleted users have their accounts and ratings permanently purged.
        </span>
        <button type="button" class="close-footer-btn" @click="emit('close')">
          Close
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  box-sizing: border-box;
}

.fullscreen-dialog {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 1100px;
  height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  position: relative;
  animation: enterModal 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes enterModal {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  padding: 1.25rem 1.75rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
}

.badge-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.dialog-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}

.admin-pill {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
}

.dialog-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}

.close-btn {
  background: #e2e8f0;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 1.4rem;
  line-height: 1;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: #cbd5e1;
  color: #0f172a;
}

.banner-feedback {
  padding: 0.75rem 1.75rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.banner-feedback.success {
  background: #ecfdf5;
  color: #065f46;
  border-bottom: 1px solid #a7f3d0;
}

.banner-feedback.error {
  background: #fef2f2;
  color: #991b1b;
  border-bottom: 1px solid #fecaca;
}

.dialog-body {
  padding: 1.5rem 1.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex: 1;
}

.capacity-card {
  background: #fdfbf7;
  border: 1px solid #fed7aa;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.capacity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.capacity-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.capacity-label {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9a3412;
}

.capacity-fraction {
  font-size: 1rem;
  color: #1e293b;
}

.progress-bar-container {
  width: 100%;
  height: 12px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.progress-bar-fill.near-limit {
  background: #f59e0b;
}

.progress-bar-fill.at-limit {
  background: #dc2626;
}

.capacity-description {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}

.warning-text {
  color: #b91c1c;
}

.expand-capacity-btn {
  background: #d97706;
  border: none;
  color: #ffffff;
  padding: 0.65rem 1.15rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
  transition: background-color 0.15s;
}

.expand-capacity-btn:hover:not(:disabled) {
  background: #b45309;
}

.expand-capacity-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 400px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 2rem 0.55rem 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.clear-search {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  font-size: 1.1rem;
  color: #94a3b8;
  cursor: pointer;
}

.filter-pills {
  display: flex;
  gap: 0.4rem;
}

.filter-pill {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 0.4rem 0.85rem;
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.table-container {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.users-table th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  font-weight: 700;
  color: #475569;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
}

.users-table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.users-table tbody tr:last-child td {
  border-bottom: none;
}

.users-table tbody tr:hover {
  background: #f8fafc;
}

.blocked-row {
  background: #fff7ed;
}

.admin-row {
  background: #fafafa;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar-container {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #e2e8f0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-weight: 700;
  color: #475569;
  font-size: 0.95rem;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 700;
  color: #0f172a;
}

.user-email {
  font-size: 0.78rem;
  color: #64748b;
}

.status-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  letter-spacing: 0.025em;
}

.status-badge.active {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.status-badge.blocked {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.role-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
}

.role-badge.admin {
  background: #ede9fe;
  color: #6d28d9;
}

.role-badge.member {
  background: #f1f5f9;
  color: #475569;
}

.ratings-pill {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.78rem;
}

.date-cell {
  font-size: 0.8rem;
  color: #64748b;
  white-space: nowrap;
}

.actions-header {
  text-align: right;
}

.actions-cell {
  text-align: right;
}

.action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.block-btn,
.delete-btn {
  border: none;
  border-radius: 5px;
  padding: 0.35rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.block-btn {
  background: #fef3c7;
  color: #92400e;
}

.block-btn:hover:not(:disabled) {
  background: #fde68a;
}

.block-btn.is-blocked {
  background: #ecfdf5;
  color: #047857;
}

.block-btn.is-blocked:hover:not(:disabled) {
  background: #d1fae5;
}

.delete-btn {
  background: #fee2e2;
  color: #991b1b;
}

.delete-btn:hover:not(:disabled) {
  background: #fecaca;
}

.protected-pill {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

.dialog-footer {
  padding: 1rem 1.75rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fafafa;
}

.footer-note {
  font-size: 0.78rem;
  color: #64748b;
  max-width: 700px;
}

.close-footer-btn {
  background: #0f172a;
  border: none;
  color: #ffffff;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.close-footer-btn:hover {
  background: #334155;
}

.loading-state,
.empty-state {
  padding: 3rem 1rem;
  text-align: center;
  color: #64748b;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 0.75rem;
}
</style>