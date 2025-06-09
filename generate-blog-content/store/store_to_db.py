from supabase import create_client, Client
import os
from dotenv import load_dotenv

# Load configuration from .env file
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xyzcompany.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-service-role-or-anon-key")

class SupabaseBlogClient:
    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    def insert_post(self, title: str, content: str, description: str):
        data = {
            "title": title,
            "url": title.replace(" ", "_").lower(),
            "content": content,
            "description": description
        }
        response = self.supabase.table("blogs").insert(data).execute()
        return response


# Example usage
if __name__ == "__main__":

    client = SupabaseBlogClient()
    result = client.insert_post(
        title="My First Blog",
        content="This is the content of the blog post."
    )
    print(result)