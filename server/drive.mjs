import { HttpError } from './security.mjs';
const API = 'https://www.googleapis.com/drive/v3';
export class Drive {
  constructor(env) { this.env = env; this.root = env.GOOGLE_DRIVE_FOLDER_ID; this.cached = null; }
  async token() {
    if (this.cached && this.cached.until > Date.now()) return this.cached.token;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        body: new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID, client_secret: this.env.GOOGLE_CLIENT_SECRET, refresh_token: this.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
      });
      if (!response.ok) throw new HttpError(503, 'La conexión con el álbum necesita atención. Inténtalo más tarde.');
      const data = await response.json();
      this.cached = { token: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 };
      return data.access_token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  async request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${await this.token()}`, ...options.headers } });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(response.status === 404 ? 404 : 503, response.status === 404 ? 'Archivo no disponible.' : 'No pudimos conectar con el álbum. Inténtalo de nuevo.'); }
    return response;
  }
  async ready() {
    const file = await (await this.request(`/files/${this.root}?fields=id,mimeType,trashed,capabilities(canAddChildren),permissions(type,role)`)).json();
    if (file.trashed || file.mimeType !== 'application/vnd.google-apps.folder' || !file.capabilities?.canAddChildren || !file.permissions?.length || file.permissions.some(p => p.role !== 'owner')) {
      throw new HttpError(503, 'El álbum está temporalmente cerrado.');
    }
  }
  async createGuest(name) {
    const response = await this.request('/files?fields=id,name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${name} · ${crypto.randomUUID().slice(0,8)}`, mimeType: 'application/vnd.google-apps.folder', parents: [this.root], appProperties: { wedding: this.root } }) });
    const folder = await response.json(); return { folderId: folder.id, name };
  }
  async assertGuest(guest) {
    const file = await this.metadata(guest.folderId);
    if (file.mimeType !== 'application/vnd.google-apps.folder' || !file.parents?.includes(this.root) || file.trashed) throw new HttpError(401, 'Este espacio ya no está disponible.');
  }
  async list(query) {
    const files = []; let pageToken = '';
    do {
      const params = new URLSearchParams({ q: query, fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,parents,trashed)', pageSize: '1000', orderBy: 'createdTime desc' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await this.request(`/files?${params}`)).json(); files.push(...data.files); pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  }
  files(guest) { return this.list(`'${guest.folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`); }
  async usage() {
    const files = await this.list(`appProperties has { key='wedding' and value='${this.root}' } and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    const about = await (await this.request('/about?fields=storageQuota')).json();
    return { total: files.reduce((n, f) => n + Number(f.size || 0), 0), free: about.storageQuota.limit ? Number(about.storageQuota.limit) - Number(about.storageQuota.usage) : Number.MAX_SAFE_INTEGER };
  }
  async begin(guest, file) {
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime', {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': file.type, 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify({ name: file.name, mimeType: file.type, parents: [guest.folderId], appProperties: { wedding: this.root } })
    });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(503, 'No pudimos preparar la carga. Inténtalo nuevamente.'); }
    const location = response.headers.get('location');
    if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new HttpError(503, 'No pudimos preparar la carga.');
    await response.body?.cancel(); return location;
  }
  async upload(location, file, stream, signal) {
    const response = await fetch(location, { method: 'PUT', headers: { 'Content-Type': file.type, 'Content-Length': String(file.size) }, body: stream, duplex: 'half', signal });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(503, 'La carga no terminó. Actualiza tu galería antes de volver a intentarlo.'); }
    return response.json();
  }
  async metadata(id) { return (await this.request(`/files/${id}?fields=id,name,mimeType,size,parents,trashed`)).json(); }
  async media(id, range) {
    return this.request(`/files/${id}?alt=media`, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(10*60000) });
  }
}
