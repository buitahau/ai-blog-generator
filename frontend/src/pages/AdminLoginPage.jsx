import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { checkToken, getToken, setToken } from '../api/auth.js';

// Only allow in-app admin paths so `next` can't be used as an open redirect.
function safeNext(next) {
  if (!next || next.startsWith('//') || !/^\/admin(\/|$|\?)/.test(next)) return '/admin/generate';
  // Login itself (or the bare /admin) as a target would leave this page mounted mid-login.
  if (/^\/admin\/?(\?.*)?$/.test(next) || /^\/admin\/login(\/|\?|$)/.test(next)) return '/admin/generate';
  return next;
}

export default function AdminLoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get('next'));

  if (getToken() && !loading) return <Navigate replace to={next} />;

  const onFinish = async ({ token }) => {
    setLoading(true);
    try {
      await checkToken(token.trim());
      setToken(token.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setLoading(false);
      message.error(err?.code === 'UNAUTHORIZED' ? 'Invalid admin token.' : (err?.message ?? 'Login failed.'));
    }
  };

  return (
    <Card style={{ maxWidth: 400, margin: '48px auto' }}>
      <Typography.Title level={2}>Admin login</Typography.Title>
      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item name="token" label="Admin token" rules={[{ required: true, whitespace: true, message: 'Enter the admin token' }]}>
          <Input.Password autoComplete="off" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          Log in
        </Button>
      </Form>
    </Card>
  );
}
