import asyncio

from crawler.crawl_articles import ArticleCrawler
from ai_module.blog_generator import BlogGenerator
from store.store_to_db import SupabaseBlogClient
from typing import List
from pathlib import Path

async def generate_blog(subject: str, urls: List[str], output_dir: str = "output"):
    # Initialize
    crawler = ArticleCrawler(subject)
    blog_generator = BlogGenerator()

    # Crawl
    print(f"🕷️ Crawling {len(urls)} sources...")
    articles, restricted_urls, failed_urls = await crawler.crawl(subject, urls)

    if not articles:
        raise ValueError("No valid articles found")

    # Generate
    print("🖊️ Generating blog content...")
    raw_contents = '\n'.join(f"{i+1}. {item['content']}" for i, item in enumerate(articles))
    result = blog_generator.generate(subject, raw_contents)

    markdown_content = result["markdown_content"]
    description = result["description"]

    # Save
    Path(output_dir).mkdir(exist_ok=True)
    filename = f"{subject.lower().replace(' ', '_')}_blog.md"
    output_path = Path(output_dir) / filename

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown_content)

    print(f"✅ Blog saved to {output_path}")

    client = SupabaseBlogClient()
    result = client.insert_post(
        title=subject,
        content=markdown_content,
        description=description
    )
    print(result)
    return markdown_content


if __name__ == "__main__":
    subject = "Retrieval Augmented Generation"
    urls = [
        "https://www.ibm.com/think/topics/large-language-models",
        "https://en.wikipedia.org/wiki/Large_language_model",
        "https://www.geeksforgeeks.org/large-language-model-llm/"
    ]

    asyncio.run(generate_blog(subject, urls))