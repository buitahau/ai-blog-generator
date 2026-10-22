import { useMemo } from 'react';
import { Typography, theme } from 'antd';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

const { Title, Paragraph, Text, Link } = Typography;

// Map markdown elements to antd Typography. rehype-sanitize (default schema, no rehype-raw)
// strips scripts, event handlers and javascript: URLs before these render.
const makeComponents = (token) => ({
  h1: (p) => <Title level={1}>{p.children}</Title>,
  h2: (p) => <Title level={2}>{p.children}</Title>,
  h3: (p) => <Title level={3}>{p.children}</Title>,
  h4: (p) => <Title level={4}>{p.children}</Title>,
  h5: (p) => <Title level={5}>{p.children}</Title>,
  // antd Title only supports levels 1-5.
  h6: (p) => <Title level={5}>{p.children}</Title>,
  p: (p) => <Paragraph>{p.children}</Paragraph>,
  a: ({ href, children }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
  code: ({ className, children }) =>
    className ? <code className={className}>{children}</code> : <Text code>{children}</Text>,
  pre: (p) => (
    <pre
      style={{
        overflowX: 'auto',
        padding: token.paddingSM,
        background: token.colorFillTertiary,
        borderRadius: token.borderRadius,
      }}
    >
      {p.children}
    </pre>
  ),
  ul: (p) => <ul>{p.children}</ul>,
  ol: (p) => <ol>{p.children}</ol>,
  li: (p) => <li>{p.children}</li>,
});

export default function MarkdownView({ content = '', urlTransform }) {
  const { token } = theme.useToken();
  const components = useMemo(() => makeComponents(token), [token]);
  return (
    <ReactMarkdown rehypePlugins={[rehypeSanitize]} urlTransform={urlTransform} components={components}>
      {content}
    </ReactMarkdown>
  );
}
