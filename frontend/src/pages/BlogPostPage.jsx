import { useParams } from 'react-router-dom';
import { Typography } from 'antd';

export default function BlogPostPage() {
  const { slug } = useParams();
  return <Typography.Title level={2}>{slug}</Typography.Title>;
}
