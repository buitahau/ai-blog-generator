import { useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken, subscribeToken } from '../api/auth.js';

export default function RequireAdmin() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const { pathname, search } = useLocation();
  if (!token) {
    return <Navigate replace to={`/admin/login?next=${encodeURIComponent(pathname + search)}`} />;
  }
  return <Outlet />;
}
