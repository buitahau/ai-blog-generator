from selenium import webdriver
from bs4 import BeautifulSoup
from typing import List, Dict, Tuple, Optional


def clean_aws_content(html: str) -> Optional[str]:
    """Fixed AWS cleaner with precise selectors."""
    soup = BeautifulSoup(html, "html.parser")

    # AWS-specific containers (priority order)
    selectors = [
        "div.aws-text-content",  # Main content
        "section#content",  # Fallback
        "article",  # Generic fallback
    ]

    for selector in selectors:
        container = soup.select_one(selector)
        if container:
            break

    if not container:
        return None

    # Remove unwanted elements
    for element in container.select("script, style, svg, nav, footer, iframe"):
        element.decompose()

    # Extract text from key tags
    text_parts = []
    for tag in container.find_all(["h1", "h2", "h3", "p", "ul", "ol", "pre"]):
        if tag.name.startswith("h"):
            level = int(tag.name[1])
            text_parts.append(f"\n{'#' * level} {tag.get_text(strip=True)}\n")
        elif tag.name == "p":
            text = tag.get_text(" ", strip=True)
            if len(text) > 10:  # Skip short paragraphs
                text_parts.append(text)
        elif tag.name in ("ul", "ol"):
            items = [
                f"{i + 1}. {li.get_text(' ', strip=True)}" if tag.name == "ol"
                else f"- {li.get_text(' ', strip=True)}"
                for i, li in enumerate(tag.find_all("li"))
            ]
            if items:
                text_parts.append("\n".join(items))
        elif tag.name == "pre":
            text_parts.append(f"```\n{tag.get_text()}\n```")

    return "\n\n".join(text_parts) if text_parts else None

url = "https://www.promptingguide.ai/techniques/rag"

# Step 1: Fetch with Selenium
driver = webdriver.Chrome()
driver.get(url)
driver.implicitly_wait(100)

# Step 2: Pass HTML to cleaner
cleaned_text = clean_aws_content(driver.page_source)

driver.quit()

# Step 3: Output
if cleaned_text:
    print("Success! Content extracted:\n", cleaned_text + "...")  # Preview
else:
    print("Failed. Possible fixes:\n1. Check selectors\n2. Increase wait time\n3. Handle Shadow DOM")