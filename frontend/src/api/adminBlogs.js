import { adminRequest } from './admin.js';

const ENDPOINT = '/api/admin/blogs';
const idUrl = (id) => `${ENDPOINT}/${encodeURIComponent(id)}`;

/** GET /api/admin/blogs. `status` (draft|published) is omitted when empty. */
export function listAdminBlogs({ status, page = 1, pageSize = 10 } = {}, { signal } = {}) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) qs.set('status', status);
  return adminRequest(`${ENDPOINT}?${qs}`, { signal });
}

export const getAdminBlog = (id, { signal } = {}) => adminRequest(idUrl(id), { signal });
export const publishBlog = (id) => adminRequest(`${idUrl(id)}/publish`, { method: 'POST' });
export const unpublishBlog = (id) => adminRequest(`${idUrl(id)}/unpublish`, { method: 'POST' });
export const deleteBlog = (id) => adminRequest(idUrl(id), { method: 'DELETE' });
