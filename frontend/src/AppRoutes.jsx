import { Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import BlogListPage from './pages/BlogListPage.jsx';
import BlogDetailPage from './pages/BlogDetailPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import AdminGeneratePage from './pages/AdminGeneratePage.jsx';
import AdminBlogsPage from './pages/AdminBlogsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<BlogListPage />} />
        <Route path="/blogs/:slug" element={<BlogDetailPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AdminLayout />}>
        <Route path="/admin/generate" element={<AdminGeneratePage />} />
        <Route path="/admin/blogs" element={<AdminBlogsPage />} />
      </Route>
    </Routes>
  );
}
