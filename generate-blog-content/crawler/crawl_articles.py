import os
import re
import json
import logging
from urllib.parse import urlparse
from typing import List, Dict, Tuple, Optional
from bs4 import BeautifulSoup, Tag
import aiohttp
import asyncio
from dotenv import load_dotenv

# Load configuration from .env file
load_dotenv()

# Configuration constants
MAX_ARTICLES_PER_SITE = int(os.getenv('MAX_ARTICLES_PER_SITE', '10'))
REQUEST_DELAY = float(os.getenv('REQUEST_DELAY', '1.0'))
USER_AGENT = os.getenv('USER_AGENT', 'BlogCrawler/1.0 (+https://yourwebsite.com)')
IGNORE_ACCESS_RESTRICTIONS = os.getenv('IGNORE_ACCESS_RESTRICTIONS', 'False').lower() == 'true'
REQUEST_TIMEOUT = 15  # seconds
MAX_CONCURRENT_REQUESTS = 10

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('crawler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ArticleCrawler:
    def __init__(self, subject: str):
        self.session = None
        self.output_dir = 'data'
        self.output_file = os.path.join(self.output_dir, 'articles_' + subject.lower().replace(' ', '_') + '.json')
        self.articles = []
        self.restricted_urls = []
        self.failed_urls = []

        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)

    async def initialize_session(self):
        """Initialize an aiohttp session with custom headers"""
        self.session = aiohttp.ClientSession(
            headers={'User-Agent': USER_AGENT},
            timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
        )

    async def close_session(self):
        """Close the aiohttp session"""
        if self.session:
            await self.session.close()

    def validate_subject(self, subject: str) -> bool:
        """Validate the subject input"""
        if not subject or len(subject) < 3:
            logger.error("Subject must be at least 3 characters long")
            return False
        if not re.match(r'^[a-zA-Z0-9\s]+$', subject):
            logger.error("Subject can only contain alphanumeric characters and spaces")
            return False
        return True

    def validate_url(self, url: str) -> bool:
        """Validate a URL"""
        try:
            result = urlparse(url)
            if not all([result.scheme, result.netloc]):
                return False
            return result.scheme in ('http', 'https')
        except ValueError:
            return False

    def get_domain(self, url: str) -> str:
        """Extract domain from URL"""
        return urlparse(url).netloc

    def is_article_url(self, url: str) -> bool:
        """Check if URL looks like an article"""
        path = urlparse(url).path.lower()
        return any(term in path for term in ['article', 'blog', 'post', 'news', 'story', 'topic'])

    async def fetch_url(self, url: str) -> Optional[str]:
        """Fetch URL content with error handling"""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.text()
                elif response.status in (403, 401):
                    logger.warning(f"Access restricted for URL: {url}")
                    self.restricted_urls.append(url)
                    return None
                else:
                    logger.warning(f"HTTP error {response.status} for URL: {url}")
                    self.failed_urls.append(url)
                    return None
        except aiohttp.ClientError as e:
            logger.warning(f"Error fetching {url}: {str(e)}")
            self.failed_urls.append(url)
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching {url}: {str(e)}")
            self.failed_urls.append(url)
            return None

    def extract_article_links(self, html: str, base_url: str) -> List[str]:
        """Extract article links from a webpage"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []

        # Common patterns for article links
        patterns = [
            {'class': re.compile(r'article|blog|post|story|news', re.I)},
            {'id': re.compile(r'article|blog|post|story|news', re.I)},
            {'href': re.compile(r'article|blog|post|news|story|topic', re.I)}
        ]

        for pattern in patterns:
            for a in soup.find_all('a', pattern):
                href = a.get('href')
                if href:
                    # Handle relative URLs
                    if href.startswith('/'):
                        href = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}{href}"
                    if self.validate_url(href) and self.is_article_url(href):
                        links.append(href)

        # Deduplicate and return
        return list(set(links))

    def clean_generic_content(self, soup: BeautifulSoup) -> str:
        """Clean and extract content from HTML, removing unwanted elements and formatting as markdown"""

        # First try to find the main content area - NVIDIA blog specific
        main_content = soup.find('article') or soup.find(class_=re.compile('content|main|post', re.I))

        if main_content:
            soup = main_content  # Work with just the content area

        # Remove unwanted elements by CSS selectors
        unwanted_selectors = [
            'header', 'footer', 'nav', 'aside', 'script', 'style',
            'iframe', 'noscript', 'svg', 'meta', 'link',
            '[class*="ad"]', '[id*="ad"]',
            '[class*="banner"]', '[id*="banner"]',
            '[class*="popup"]', '[id*="popup"]',
            '[class*="modal"]', '[id*="modal"]',
            '[class*="sponsor"]', '[id*="sponsor"]',
            '[class*="cookie"]', '[id*="cookie"]',
            '[class*="newsletter"]', '[id*="newsletter"]',
            '[class*="comment"]', '[id*="comment"]',
            '[class*="share"]', '[id*="share"]',
            '[class*="social"]', '[id*="social"]',
            '[class*="sidebar"]', '[id*="sidebar"]',
            '[class*="widget"]', '[id*="widget"]',
            '[class*="menu"]', '[id*="menu"]',
            '[class*="navigation"]', '[id*="navigation"]',
            '[role="banner"]', '[role="navigation"]',
            '[role="complementary"]',
            'figure',  # Often contains non-content images
            '.wp-block-nvidia-related-posts'  # NVIDIA specific related posts
        ]

        for selector in unwanted_selectors:
            for element in soup.select(selector):
                element.decompose()

        # Extract and format content parts
        content_parts = []
        for element in soup.find_all(recursive=True):
            if isinstance(element, Tag):
                text = element.get_text(' ', strip=True)  # Use space to preserve word separation
                if not text or len(text) < 10:  # Skip very short texts
                    continue

                if element.name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
                    content_parts.append(f"\n{'#' * (int(element.name[1]) + 1)} {text}\n")
                elif element.name == 'p':
                    content_parts.append(text)
                elif element.name in ('ul', 'ol'):
                    list_items = []
                    for li in element.find_all('li', recursive=False):
                        li_text = li.get_text(' ', strip=True)
                        if li_text:
                            prefix = '- ' if element.name == 'ul' else f"{len(list_items) + 1}. "
                            list_items.append(f"{prefix}{li_text}")
                    if list_items:
                        content_parts.append('\n'.join(list_items))
                elif element.name == 'blockquote':
                    content_parts.append(f"> {text}")
                elif element.name == 'pre':
                    content_parts.append(f"```\n{text}\n```")
                elif element.name == 'code':
                    content_parts.append(f"`{text}`")
                elif element.name == 'table':
                    rows = []
                    for tr in element.find_all('tr'):
                        cells = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
                        if cells:
                            rows.append(" | ".join(cells))
                    if rows:
                        # Add markdown table formatting
                        if len(rows) > 1:
                            separator = " | ".join(["---"] * len(rows[0].split("|")))
                            rows.insert(1, separator)
                        content_parts.append('\n'.join(rows))

        # Deduplicate content parts while preserving order
        seen = set()
        unique_parts = []
        for part in content_parts:
            # Normalize by removing markdown prefixes and extra whitespace
            normalized = re.sub(r'^[#>\-\d\.`]+', '', part)
            normalized = re.sub(r'\s+', ' ', normalized).strip().lower()

            if normalized and len(normalized) > 15 and normalized not in seen:
                seen.add(normalized)
                unique_parts.append(part)

        # Join content into final markdown
        content = '\n\n'.join(unique_parts)

        # Normalize excessive newlines and clean up
        content = re.sub(r'\n{3,}', '\n\n', content)
        content = re.sub(r'(\n\s*)+\n', '\n\n', content)

        return content.strip()

    def clean_aws_content(self, soup: BeautifulSoup) -> Optional[str]:
        """Specialized cleaner for AWS documentation pages"""

        # AWS-specific content containers
        content_selectors = [
            'div[class*="content"]',
            'div[class*="main"]',
            'div[class*="article"]',
            'div[class*="body"]',
            'article',
            'main'
        ]

        # Try to find the main content area
        main_content = None
        for selector in content_selectors:
            main_content = soup.select_one(selector)
            if main_content:
                break

        if not main_content:
            return None

        # Remove AWS-specific unwanted elements
        unwanted_aws_selectors = [
            'header', 'footer', 'nav', 'aside',
            'script', 'style', 'iframe', 'noscript',
            'svg', 'meta', 'link', 'form', 'button',
            '[class*="alert"]', '[class*="notification"]',
            '[class*="breadcrumb"]', '[class*="toc"]',
            '[class*="sidebar"]', '[class*="related"]',
            '[class*="feedback"]', '[class*="signup"]',
            '[class*="modal"]', '[class*="lightbox"]',
            '[class*="tooltip"]', '[class*="cookie"]',
            '[class*="teaser"]', '[class*="promo"]',
            '[class*="disclaimer"]', '[class*="legal"]',
            '.lb-ribbon-container',  # AWS ribbon
            '.aws-nav-header',  # AWS header
            '.aws-footer'  # AWS footer
        ]

        for selector in unwanted_aws_selectors:
            for element in main_content.select(selector):
                element.decompose()

        # AWS-specific text extraction
        content_parts = []

        # Handle headings
        for h in main_content.find_all(re.compile('^h[1-6]$')):
            level = int(h.name[1])
            content_parts.append(f"\n{'#' * level} {h.get_text(strip=True)}\n")

        # Handle paragraphs and lists
        for element in main_content.find_all(['p', 'ul', 'ol', 'blockquote'], recursive=True):
            text = element.get_text(' ', strip=True)
            if not text or len(text) < 15:
                continue

            if element.name == 'p':
                content_parts.append(text)
            elif element.name == 'ul':
                items = [f"- {li.get_text(' ', strip=True)}" for li in element.find_all('li') if
                         li.get_text(strip=True)]
                if items:
                    content_parts.append('\n'.join(items))
            elif element.name == 'ol':
                items = [f"{i + 1}. {li.get_text(' ', strip=True)}" for i, li in enumerate(element.find_all('li')) if
                         li.get_text(strip=True)]
                if items:
                    content_parts.append('\n'.join(items))
            elif element.name == 'blockquote':
                content_parts.append(f"> {text}")

        # Handle code blocks (AWS-specific)
        for pre in main_content.find_all('pre'):
            code = pre.get_text('\n', strip=True)
            if code:
                content_parts.append(f"```\n{code}\n```")

        # Handle tables (AWS often uses these for feature comparisons)
        for table in main_content.find_all('table'):
            rows = []
            for tr in table.find_all('tr'):
                cells = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                # Add markdown table formatting
                if len(rows) > 1:
                    separator = " | ".join(["---"] * len(rows[0].split("|")))
                    rows.insert(1, separator)
                content_parts.append('\n'.join(rows))

        # Deduplicate while preserving order
        seen = set()
        unique_parts = []
        for part in content_parts:
            normalized = re.sub(r'\s+', ' ', part).lower().strip()
            if normalized and len(normalized) > 20 and normalized not in seen:
                seen.add(normalized)
                unique_parts.append(part)

        content = '\n\n'.join(unique_parts)
        content = re.sub(r'\n{3,}', '\n\n', content)

        return content.strip() if content else None

    def clean_intel_content(self, soup: BeautifulSoup) -> Optional[str]:
        """Specialized cleaner for Intel documentation pages"""

        # Intel-specific content containers
        content_selectors = [
            'div.dc-page',  # Intel's main content container
            'div.dc-container',
            'article',
            'main',
            'div[class*="content"]',
            'div[class*="main"]',
            'div[class*="article"]',
            'div[class*="body"]',
        ]

        # Try to find the main content area
        main_content = None
        for selector in content_selectors:
            main_content = soup.select_one(selector)
            if main_content:
                break

        if not main_content:
            return None

        # Remove Intel-specific unwanted elements
        unwanted_intel_selectors = [
            'header', 'footer', 'nav', 'aside',
            'script', 'style', 'iframe', 'noscript',
            'svg', 'meta', 'link', 'form', 'button',
            '[class*="alert"]', '[class*="notification"]',
            '[class*="breadcrumb"]', '[class*="toc"]',
            '[class*="sidebar"]', '[class*="related"]',
            '[class*="feedback"]', '[class*="signup"]',
            '[class*="modal"]', '[class*="lightbox"]',
            '[class*="tooltip"]', '[class*="cookie"]',
            '[class*="teaser"]', '[class*="promo"]',
            '[class*="disclaimer"]', '[class*="legal"]',
            '.dc-header',  # Intel header
            '.dc-footer',  # Intel footer
            '.dc-breadcrumbs',  # Breadcrumbs
            '.dc-related-content',  # Related content
        ]

        for selector in unwanted_intel_selectors:
            for element in main_content.select(selector):
                element.decompose()

        # Intel-specific text extraction
        content_parts = []

        # Handle headings (Intel uses h1, h2, h3, etc.)
        for h in main_content.find_all(re.compile('^h[1-6]$')):
            level = int(h.name[1])
            content_parts.append(f"\n{'#' * level} {h.get_text(strip=True)}\n")

        # Handle paragraphs and lists
        for element in main_content.find_all(['p', 'ul', 'ol', 'blockquote'], recursive=True):
            text = element.get_text(' ', strip=True)
            if not text or len(text) < 15:
                continue

            if element.name == 'p':
                content_parts.append(text)
            elif element.name == 'ul':
                items = [f"- {li.get_text(' ', strip=True)}" for li in element.find_all('li') if
                         li.get_text(strip=True)]
                if items:
                    content_parts.append('\n'.join(items))
            elif element.name == 'ol':
                items = [f"{i + 1}. {li.get_text(' ', strip=True)}" for i, li in enumerate(element.find_all('li')) if
                         li.get_text(strip=True)]
                if items:
                    content_parts.append('\n'.join(items))
            elif element.name == 'blockquote':
                content_parts.append(f"> {text}")

        # Handle code blocks (Intel sometimes uses these)
        for pre in main_content.find_all('pre'):
            code = pre.get_text('\n', strip=True)
            if code:
                content_parts.append(f"```\n{code}\n```")

        # Handle tables (Intel uses tables for comparisons)
        for table in main_content.find_all('table'):
            rows = []
            for tr in table.find_all('tr'):
                cells = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                # Add markdown table formatting
                if len(rows) > 1:
                    separator = " | ".join(["---"] * len(rows[0].split("|")))
                    rows.insert(1, separator)
                content_parts.append('\n'.join(rows))

        # Deduplicate while preserving order
        seen = set()
        unique_parts = []
        for part in content_parts:
            normalized = re.sub(r'\s+', ' ', part).lower().strip()
            if normalized and len(normalized) > 20 and normalized not in seen:
                seen.add(normalized)
                unique_parts.append(part)

        content = '\n\n'.join(unique_parts)
        content = re.sub(r'\n{3,}', '\n\n', content)

        return content.strip() if content else None

    def extract_metadata(self, soup: BeautifulSoup, url: str, subject: str) -> Dict:
        """Extract article metadata"""
        title = soup.title.string if soup.title else urlparse(url).path.replace('/', ' ').strip()

        # Try to find better title in h1 or og:title
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text().strip()

        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title.get('content').strip()

        return {
            'title': title,
            'url': url,
            'source': self.get_domain(url),
            'subject': subject
        }

    async def process_article(self, url: str, subject: str) -> Optional[Dict]:
        """Process a single article URL"""
        logger.info(f"Processing article: {url}")

        html = await self.fetch_url(url)
        if not html:
            return None

        soup = BeautifulSoup(html, 'html.parser')
        metadata = self.extract_metadata(soup, url, subject)
        content = self.clean_content(soup, url)

        if not content:
            logger.warning(f"No meaningful content extracted from {url}")
            self.failed_urls.append(url)
            return None

        article = {
            **metadata,
            'content': content
        }

        return article

    def clean_content(self, soup: BeautifulSoup, url: str, ) -> Optional[str]:
        """
        Route to the appropriate cleaner based on the URL domain.
        Returns cleaned markdown content or None if no cleaner matches.
        """

        # Define domain-specific cleaners
        if "aws.amazon.com" in url:
            return self.clean_aws_content(soup)
        elif "intel.com" in url:
            return self.clean_intel_content(soup)
        else:
            # Fallback to a generic cleaner
            return self.clean_generic_content(soup)

    async def crawl_website(self, url: str, subject: str) -> List[Dict]:
        """Crawl a website and process articles"""
        articles = []
        article = await self.process_article(url, subject)
        if article:
            articles.append(article)
        return articles

    async def crawl(self, subject: str, urls: List[str]) -> Tuple[List[Dict], List[str], List[str]]:
        """Main crawling function"""
        if not self.validate_subject(subject):
            raise ValueError("Invalid subject")

        invalid_urls = [url for url in urls if not self.validate_url(url)]
        if invalid_urls:
            logger.error(f"Invalid URLs provided: {invalid_urls}")
            raise ValueError("One or more URLs are invalid")

        await self.initialize_session()

        try:
            # Process URLs concurrently
            tasks = [self.crawl_website(url, subject) for url in urls]
            results = await asyncio.gather(*tasks)

            # Flatten results
            for website_articles in results:
                self.articles.extend(website_articles)

            # Save results
            self.save_results()

            return self.articles, self.restricted_urls, self.failed_urls
        finally:
            await self.close_session()

    def save_results(self):
        """Save results to JSON file"""
        try:
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(self.articles, f, indent=2, ensure_ascii=False)
            logger.info(f"Successfully saved {len(self.articles)} articles to {self.output_file}")
        except Exception as e:
            logger.error(f"Error saving results: {str(e)}")
            raise


async def main():
    """Example usage"""
    # Example inputs
    subject = "Retrieval Augmented Generation"
    urls = [
        "https://www.coursera.org/articles/what-is-rag-in-ai?utm_medium=sem&utm_source=gg&utm_campaign=b2c_apac_x_multi_ftcof_career-academy_cx_dr_bau_gg_pmax_gc_s2_all_m_hyb_24-08_x&campaignid=21573875733&adgroupid=&device=c&keyword=&matchtype=&network=x&devicemodel=&creativeid=&assetgroupid=6544910561&targetid=&extensionid=&placement=&gad_source=1&gad_campaignid=21584159401&gclid=CjwKCAjw3_PCBhA2EiwAkH_j4u0E0WvVkDOsArAXICOvamd7Lj-j5_1rbgqQqVPlZ6i4SmbxZ3a3dRoCRfkQAvD_BwE",
        "https://blogs.nvidia.com/blog/what-is-retrieval-augmented-generation",
        "https://aws.amazon.com/what-is/retrieval-augmented-generation",
        "https://www.ibm.com/think/topics/retrieval-augmented-generation",
        "https://www.intel.com/content/www/us/en/learn/what-is-rag.html",
        "https://www.promptingguide.ai/techniques/rag"
    ]

    crawler = ArticleCrawler(subject)
    try:
        articles, restricted_urls, failed_urls = await crawler.crawl(subject, urls)

        print(f"\nCrawling completed with {len(articles)} articles found:")
        for article in articles[:3]:  # Print first 3 articles as sample
            print(f"\nTitle: {article['title']}")
            print(f"Source: {article['source']}")
            print(f"Content preview: {article['content'][:200]}...")

        if restricted_urls:
            print(f"\nRestricted URLs ({len(restricted_urls)}):")
            for url in restricted_urls[:3]:
                print(f"- {url}")

        if failed_urls:
            print(f"\nFailed URLs ({len(failed_urls)}):")
            for url in failed_urls[:3]:
                print(f"- {url}")
    except Exception as e:
        logger.error(f"Error during crawling: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())