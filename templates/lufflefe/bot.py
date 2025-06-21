import openai
import base64
from typing import Optional

class Bot:
    def __init__(self):
        self.client = openai.OpenAI()
        self.messages = []

    def encode_image(self, image_path: str) -> str:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    def send_message(self, role: str, content: str, image_path: Optional[str] = None):
        if image_path:
            base64_image = self.encode_image(image_path)
            message_content = [
                {"type": "text", "text": content},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}",
                    },
                },
            ]
        else:
            message_content = content

        self.messages.append({"role": role, "content": message_content})
        
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=self.messages,
            temperature=0.7,
            max_tokens=1000
        )
        return response.choices[0].message.content
