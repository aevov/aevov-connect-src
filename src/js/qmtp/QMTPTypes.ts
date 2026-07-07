/**
 * QMTP — Quantum Message Transfer Protocol
 * 
 * Core types and message format for the Aevov mail system.
 * Built on HTTQ identity-based routing. Backwards-compatible
 * with SMTP at the bridge layer.
 * 
 * Internal (.q) addressing is resolved via Nostr pubkey mapping.
 * Messages between Aevov users travel encrypted over Nostr (NIP-44).
 * 
 * QMTP/1.0 — Part of the HTTQ Protocol Family
 * © 2026 WPWakanda LLC / Aevov AI Technologies
 */

// ──── Address Types ────

export interface QAddress {
  local: string;        // "alice"
  domain: string;       // "quantum.q"  
  full: string;         // "alice@quantum.q"
  address?: string;     // Full display address (e.g., "alice@quantum.q")
  name?: string;        // Display name (e.g., "Alice")
  qik?: string;         // HTTQ Quantum Identity Key (hex pubkey hash)
  nostrPub?: string;    // Nostr hex pubkey (for transport)
}

export type QDomain = 'quantum.q' | 'mail.q' | 'qmail.q';

export const Q_DOMAINS: QDomain[] = ['quantum.q', 'mail.q', 'qmail.q'];

/**
 * Check if an address is an internal .q address
 */
export function isQAddress(address: string): boolean {
  const domain = address.split('@')[1]?.toLowerCase();
  return Q_DOMAINS.includes(domain as QDomain);
}

/**
 * Parse an email-like address into a QAddress
 */
export function parseQAddress(address: string): QAddress | null {
  const match = address.match(/^([^@]+)@(.+)$/);
  if (!match) return null;
  return {
    local: match[1].toLowerCase(),
    domain: match[2].toLowerCase(),
    full: `${match[1].toLowerCase()}@${match[2].toLowerCase()}`,
  };
}

/**
 * All three .q addresses for a username
 */
export function getAllQAddresses(username: string): string[] {
  return Q_DOMAINS.map(d => `${username}@${d}`);
}

// ──── Message Types ────

export type MessagePriority = 'urgent' | 'normal' | 'low' | 'whisper';
export type MessageState = 'draft' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type FolderType = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'crystal';

export interface QMTPMessage {
  id: string;                    // Unique message ID (UUID or event ID)
  version: '1.0';                // QMTP version
  from: QAddress;
  to: QAddress[];
  cc?: QAddress[];
  subject: string;
  body: string;                  // Plaintext body
  bodyHtml?: string;             // Optional HTML body
  timestamp: number;             // Unix seconds
  priority: MessagePriority;
  state: MessageState;
  folder: FolderType;
  
  // Crypto
  encrypted: boolean;            // True for Aevov-to-Aevov (NIP-44)
  signature?: string;            // Sender's Schnorr/Dilithium signature
  
  // HTTQ routing
  originQik?: string;            // Sender's QIK hash
  destinationQik?: string;       // Recipient's QIK hash
  
  // Nostr transport
  nostrEventId?: string;         // Kind 1059 event ID (if sent via Nostr)
  
  // Attachments
  attachments?: QMTPAttachment[];
  
  // Threading
  inReplyTo?: string;            // Message ID of parent
  threadId?: string;             // Thread root message ID
  
  // Quantum features
  ephemeral?: boolean;           // Self-destructing message
  ephemeralTTL?: number;         // Seconds until destruction
  attestation?: boolean;         // Is this a signed attestation
  crystalSaved?: boolean;        // Saved to Knowledge Crystal
  
  // Read tracking
  readAt?: number;
}

export interface QMTPAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  data?: string;                 // Base64 encoded (for small attachments)
  blobUrl?: string;              // Vercel Blob / R2 URL (for large)
  encrypted: boolean;
}

// ──── Contact Types ────

export interface QContact {
  username: string;
  addresses: string[];           // All .q addresses
  nostrPub?: string;
  displayName?: string;
  avatar?: string;
  popScore?: number;
  lastContacted?: number;
}

// ──── Registry (QNS for mail) ────

/**
 * Local address book mapping usernames to Nostr pubkeys.
 * In production, this would be resolved via QNS/Nostr profile lookups.
 */
export interface QAddressRegistry {
  entries: Record<string, string>;  // username → nostr hex pubkey
}

/**
 * Register a .q address mapping
 */
export function registerQAddress(
  registry: QAddressRegistry,
  username: string,
  nostrHexPub: string,
): QAddressRegistry {
  return {
    entries: { ...registry.entries, [username.toLowerCase()]: nostrHexPub },
  };
}

/**
 * Resolve a .q address to a Nostr pubkey
 */
export function resolveQAddress(
  registry: QAddressRegistry,
  address: string,
): string | null {
  const parsed = parseQAddress(address);
  if (!parsed) return null;
  if (!isQAddress(address)) return null;
  return registry.entries[parsed.local] || null;
}

// ──── Message Factory ────

let _idCounter = 0;

export function createMessageId(): string {
  _idCounter++;
  return `qmtp-${Date.now()}-${_idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMessage(
  from: string,
  to: string[],
  subject: string,
  body: string,
  options?: Partial<QMTPMessage>,
): QMTPMessage {
  const fromAddr = parseQAddress(from);
  const toAddrs = to.map(t => parseQAddress(t)).filter(Boolean) as QAddress[];

  if (!fromAddr || toAddrs.length === 0) {
    throw new Error('Invalid from/to address');
  }

  return {
    id: createMessageId(),
    version: '1.0',
    from: fromAddr,
    to: toAddrs,
    subject,
    body,
    timestamp: Math.floor(Date.now() / 1000),
    priority: 'normal',
    state: 'draft',
    folder: 'drafts',
    encrypted: false,
    ...options,
  };
}
