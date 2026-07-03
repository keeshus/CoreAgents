import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { secretVaults, groupVaultConfig } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { encrypt, decrypt, ensureInitialKeyVersion } from '../utils/encryption.js';
import { testConnection } from '../services/cyberark.js';

const router = Router();
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

function sanitizeVault(vault: any) {
  const { api_key, ...safe } = vault;
  return { ...safe, hasApiKey: !!api_key };
}

// GET /api/secret-vaults
router.get('/', requirePermission('vaults:read'), asyncHandler(async (_req, res) => {
  const rows = await db.select().from(secretVaults).orderBy(secretVaults.created_at);
  res.json(rows.map(sanitizeVault));
}));

// POST /api/secret-vaults — CyberArk Conjur
router.post('/', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const { name, vaultType = 'cyberark', baseUrl, account = 'conjur', login, apiKey, caCert, selfHosted = false } = req.body || {};
  if (!name || !baseUrl || !login || !apiKey) {
    res.status(400).json({ error: 'name, baseUrl, login, and apiKey are required' }); return;
  }

  await ensureInitialKeyVersion();
  const encApiKey = await encrypt(apiKey);

  const [vault] = await db.insert(secretVaults).values({
    name,
    vault_type: vaultType,
    base_url: baseUrl,
    account,
    login,
    api_key: encApiKey.encryptedValue + ':' + encApiKey.iv + ':' + encApiKey.tag + ':' + encApiKey.keyVersion,
    ca_cert: caCert || null,
    self_hosted: selfHosted,
  }).returning();

  res.status(201).json(sanitizeVault(vault));
}));

// PUT /api/secret-vaults/:id
router.put('/:id', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [vault] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  if (!vault) { res.status(404).json({ error: 'Vault not found' }); return; }

  const { name, baseUrl, account, login, apiKey, caCert, selfHosted } = req.body || {};
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name;
  if (baseUrl !== undefined) updates.base_url = baseUrl;
  if (account !== undefined) updates.account = account;
  if (login !== undefined) updates.login = login;
  if (caCert !== undefined) updates.ca_cert = caCert || null;
  if (selfHosted !== undefined) updates.self_hosted = selfHosted;

  if (apiKey) {
    await ensureInitialKeyVersion();
    const enc = await encrypt(apiKey);
    updates.api_key = enc.encryptedValue + ':' + enc.iv + ':' + enc.tag + ':' + enc.keyVersion;
  }

  await db.update(secretVaults).set(updates).where(eq(secretVaults.id, id));
  const [updated] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  res.json(sanitizeVault(updated));
}));

// DELETE /api/secret-vaults/:id
router.delete('/:id', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [bound] = await db.select().from(groupVaultConfig).where(eq(groupVaultConfig.vault_id, id));
  if (bound) { res.status(409).json({ error: 'Cannot delete vault that is bound to active groups' }); return; }

  await db.delete(secretVaults).where(eq(secretVaults.id, id));
  res.json({ status: 'deleted' });
}));

// POST /api/secret-vaults/:id/test — test Conjur connectivity
router.post('/:id/test', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [vault] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  if (!vault) { res.status(404).json({ error: 'Vault not found' }); return; }

  const keyParts = vault.api_key.split(':');
  const apiKey = await decrypt(keyParts[0], keyParts[1], keyParts[2], parseInt(keyParts[3]));

  const result = await testConnection({
    baseUrl: vault.base_url,
    account: vault.account,
    login: vault.login,
    apiKey,
    caCert: vault.ca_cert ?? undefined,
    selfHosted: vault.self_hosted,
  });

  await db.update(secretVaults).set({ is_connected: result.success }).where(eq(secretVaults.id, id));
  res.json(result);
}));

export default router;
