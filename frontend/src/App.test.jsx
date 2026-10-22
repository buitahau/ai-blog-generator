import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App.jsx';

afterEach(cleanup);

it('renders the header', () => {
  render(
    <ConfigProvider>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>,
  );
  expect(screen.getByText('Blog Generator')).toBeTruthy();
});
