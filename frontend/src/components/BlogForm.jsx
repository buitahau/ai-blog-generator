import { useEffect } from 'react';
import { Button, Form, Input, Segmented, Select, Space } from 'antd';
import { DEFAULTS, LENGTH_OPTIONS, LIMITS, TONE_OPTIONS } from '../constants/options.js';

// Builds the request body; blank optional fields are omitted per the API contract.
function toPayload(values) {
  const payload = {
    topic: values.topic.trim(),
    tone: values.tone,
    length: values.length,
  };
  const audience = values.audience?.trim();
  if (audience) payload.audience = audience;
  const keywords = (values.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length > 0) payload.keywords = keywords;
  return payload;
}

const FIELDS = ['topic', 'tone', 'length', 'audience', 'keywords'];

// Backend paths can be nested (e.g. "keywords.2"); map them to the top-level field.
function toFieldErrors(details) {
  const byField = new Map();
  for (const { path, message } of details ?? []) {
    const name = String(path ?? '').split('.')[0];
    if (!FIELDS.includes(name)) continue;
    byField.set(name, [...(byField.get(name) ?? []), message]);
  }
  return [...byField].map(([name, errors]) => ({ name, errors }));
}

export default function BlogForm({ onSubmit, loading = false, onCancel, errorDetails }) {
  const [form] = Form.useForm();

  useEffect(() => {
    const fields = toFieldErrors(errorDetails);
    if (fields.length > 0) form.setFields(fields);
  }, [errorDetails, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={DEFAULTS}
      onFinish={(values) => onSubmit(toPayload(values))}
      requiredMark="optional"
    >
      <Form.Item
        name="topic"
        label="Topic"
        rules={[
          { required: true, whitespace: true, message: 'Topic is required' },
          { min: LIMITS.topicMin, transform: (v) => v?.trim(), message: `Topic must be at least ${LIMITS.topicMin} characters` },
          { max: LIMITS.topicMax, transform: (v) => v?.trim(), message: `Topic must be at most ${LIMITS.topicMax} characters` },
        ]}
      >
        <Input maxLength={LIMITS.topicMax} showCount placeholder="What should the post be about?" />
      </Form.Item>

      <Form.Item name="tone" label="Tone">
        <Select options={TONE_OPTIONS} />
      </Form.Item>

      <Form.Item name="length" label="Length">
        <Segmented aria-label="Length" options={LENGTH_OPTIONS} />
      </Form.Item>

      <Form.Item
        name="audience"
        label="Audience"
        rules={[{ max: LIMITS.audienceMax, message: `Audience must be at most ${LIMITS.audienceMax} characters` }]}
      >
        <Input maxLength={LIMITS.audienceMax} placeholder="e.g. junior developers" />
      </Form.Item>

      <Form.Item
        name="keywords"
        label="Keywords"
        rules={[
          {
            validator: (_, value = []) => {
              const keywords = value.map((k) => k.trim()).filter(Boolean);
              if (keywords.length > LIMITS.keywordsMax) {
                return Promise.reject(new Error(`At most ${LIMITS.keywordsMax} keywords`));
              }
              if (keywords.some((k) => k.length > LIMITS.keywordMax)) {
                return Promise.reject(
                  new Error(`Each keyword must be at most ${LIMITS.keywordMax} characters`),
                );
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        <Select mode="tags" open={false} tokenSeparators={[',']} placeholder="Type a keyword and press Enter" />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            Generate
          </Button>
          {loading && <Button onClick={onCancel}>Cancel</Button>}
        </Space>
      </Form.Item>
    </Form>
  );
}
