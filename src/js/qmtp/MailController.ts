/**
 * QMTP Mail Controller — API-backed
 *
 * Replaces the InMemoryMailStore with fetch() calls to /api/quantum-mail.
 * Works both same-origin (aevov.com) and cross-origin (connect.aevov.com).
 */

import {
  QMTPMessage,
  QContact,
  FolderType,
  MessagePriority,
} from './QMTPTypes';

// ──── API helpers ────

function getApiBase(): string {
  if (typeof window === 'undefined') return 'https://aevov.com';
  const host = window.location.hostname;
  // Same origin (aevov.com desktop iframe)
  if (host === 'aevov.com' || host === 'www.aevov.com') return '';
  // Cross-origin (connect.aevov.com or localhost)
  return 'https://aevov.com';
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem('aevov_unified_session');
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.id) {
        headers['Authorization'] = 'Bearer ' + btoa(raw);
        headers['X-Aevov-UID'] = session.id;
        headers['X-Aevov-DN'] = session.displayName || session.id;
      }
    }
  } catch (_) {}
  return headers;
}

async function apiGet(action: string, params?: Record<string, string>): Promise<any> {
  const base = getApiBase();
  const qs = new URLSearchParams({ action, ...(params || {}) }).toString();
  const r = await fetch(`${base}/api/quantum-mail?${qs}`, { headers: getAuthHeaders() });
  return r.json();
}

async function apiPost(action: string, body?: any): Promise<any> {
  const base = getApiBase();
  const r = await fetch(`${base}/api/quantum-mail?action=${action}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

// ──── Controller ────

interface MailProfile {
  internalAddress: string;
  q3Address: string;
  quantumQAddress: string | null;
  preferences: {
    notifications: boolean;
    sound: boolean;
    desktopNotifications: boolean;
    encryptionEnabled: boolean;
    nsfwFilter: boolean;
    spamSensitivity: number;
    signature: string;
  };
}

export class QMTPMailController {
  private username: string;
  private _pubkey: string;
  private profile: MailProfile | null = null;
  private _onNewMail?: (msg: QMTPMessage) => void;

  constructor(username: string, pubkey: string) {
    this.username = username.toLowerCase();
    this._pubkey = pubkey;
  }

  async init(): Promise<void> {
    try {
      const r = await apiGet('profile');
      if (r.ok && r.profile) this.profile = r.profile;
    } catch (_) {}
  }

  setOnNewMail(cb: (msg: QMTPMessage) => void): void {
    this._onNewMail = cb;
  }

  getMyAddress(): string {
    return this.profile?.q3Address || `${this.username}@aevov.q3`;
  }

  getPubkey(): string {
    return this._pubkey;
  }

  hasNewMailListener(): boolean {
    return !!this._onNewMail;
  }

  getMyAddresses(): string[] {
    const addrs = [this.getMyAddress()];
    if (this.profile?.internalAddress) addrs.push(this.profile.internalAddress);
    if (this.profile?.quantumQAddress) addrs.push(this.profile.quantumQAddress);
    return addrs;
  }

  getProfile(): MailProfile | null {
    return this.profile;
  }

  async compose(
    to: string[],
    subject: string,
    body: string,
    options?: Partial<QMTPMessage>,
  ): Promise<QMTPMessage> {
    const r = await apiPost('compose', {
      to,
      cc: options?.cc ? (options.cc as any).map((c: any) => c.full || c) : [],
      subject,
      body,
      priority: options?.priority || 'normal',
      attachments: options?.attachments || [],
    });
    if (!r.ok) throw new Error(r.error || 'compose_failed');
    return r.message;
  }

  async send(
    to: string[],
    subject: string,
    body: string,
    options?: {
      cc?: string[];
      bcc?: string[];
      priority?: MessagePriority;
      attachments?: any[];
      ephemeralTTL?: number;
      crystalSave?: boolean;
      draftId?: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string; delivered?: any[] }> {
    const r = await apiPost('send', {
      to,
      cc: options?.cc || [],
      bcc: options?.bcc || [],
      subject,
      body,
      priority: options?.priority || 'normal',
      attachments: options?.attachments || [],
      ephemeralTTL: options?.ephemeralTTL || 0,
      crystalSave: options?.crystalSave || false,
      draftId: options?.draftId || null,
    });
    if (!r.ok) return { success: false, error: r.error };
    return { success: true, messageId: r.messageId, delivered: r.delivered };
  }

  async reply(
    originalId: string,
    body: string,
    options?: { priority?: MessagePriority },
  ): Promise<{ success: boolean; error?: string }> {
    const r = await apiPost('reply', {
      originalId,
      body,
      priority: options?.priority || 'normal',
    });
    return { success: r.ok, error: r.error };
  }

  async getFolder(folder: FolderType, limit?: number): Promise<QMTPMessage[]> {
    const r = await apiGet(folder, limit ? { limit: String(limit) } : undefined);
    return r.ok ? r.messages : [];
  }

  async getInbox(limit?: number): Promise<QMTPMessage[]> {
    return this.getFolder('inbox', limit);
  }

  async getSent(limit?: number): Promise<QMTPMessage[]> {
    return this.getFolder('sent', limit);
  }

  async getDrafts(): Promise<QMTPMessage[]> {
    return this.getFolder('drafts');
  }

  async getMessage(id: string): Promise<QMTPMessage | null> {
    const r = await apiGet('message', { id });
    return r.ok ? r.message : null;
  }

  async markRead(id: string): Promise<void> {
    await apiPost('mark_read', { id });
  }

  async moveToTrash(id: string): Promise<void> {
    await apiPost('move', { id, folder: 'trash' });
  }

  async archive(id: string): Promise<void> {
    await apiPost('move', { id, folder: 'archive' });
  }

  async search(query: string): Promise<QMTPMessage[]> {
    const r = await apiGet('search', { q: query });
    return r.ok ? r.messages : [];
  }

  async getUnreadCount(): Promise<number> {
    const r = await apiGet('unread_count');
    return r.ok ? r.count : 0;
  }

  async getContacts(): Promise<QContact[]> {
    const r = await apiGet('contacts');
    return r.ok ? r.contacts : [];
  }

  async addContact(address: string, label?: string): Promise<void> {
    await apiPost('contact_add', { address, label });
  }

  async removeContact(contactId: string): Promise<void> {
    await apiPost('contact_remove', { contactId });
  }

  destroy(): void {}
}
