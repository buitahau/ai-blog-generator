import os
import openai
import json

class BlogGenerator:
    def __init__(self, api_key: str = None, model: str = "o1-mini"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key is not set.")
        openai.api_key = self.api_key
        self.model = model

    def generate(self, subject: str, raw_contents: str) -> str:
        """
        Generate a Markdown-formatted blog post from the given subject and raw content.
        """
        prompt = f"""
You are a professional blog writer.

Task:
- Analyze the raw contents and understand their meaning.
- Summarize and reorganize the information logically.
- Describe each raw content item in detail.
- Rewrite the content in a professional blog style, with a friendly and informative tone.
- Ensure the post has a clear structure: an engaging introduction, well-organized body, and a thoughtful conclusion.
- Highlight key insights or takeaways.
- Format the output as Markdown using:
  - # for the main title
  - ## for subheadings
  - Bullet points, numbered lists, blockquotes where helpful
  - **bold**, *italic*, or inline code where appropriate

Output:
- Return the result as a JSON object with two fields:
  - "description": A concise summary of the blog (about 100-150 words). This should capture the key message and purpose of the blog.
  - "markdown_content": The full blog post written in Markdown format. 
    - Use # for the main title.
    - Use ## for subheadings (including one per key point if suitable).
    - Use bullet points, numbered lists, blockquotes where helpful.
    - Use **bold**, *italic*, or inline code formatting where needed.

Input:
- Subject: {subject}
- Raw Contents:
  {raw_contents}
"""

        response = openai.ChatCompletion.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=1,
            max_completion_tokens=10000
        )

        content = response['choices'][0]['message']['content']
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            raise ValueError("Failed to parse JSON from response:\n" + content)

        return result