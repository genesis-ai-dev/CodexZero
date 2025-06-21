from typing import Optional, Dict, Any, List
import os
from anthropic import AsyncAnthropic, Anthropic

class Chatbot:
    def __init__(self, model: str = "claude-sonnet-4-20250514", temperature: float = 0.5):
        self.model = model
        self.temperature = temperature
        self.conversation_history: List[Dict[str, str]] = []
        
        # Initialize Anthropic clients with API key from environment
        api_key = os.getenv('ANTHROPIC_KEY')
        self.async_client = AsyncAnthropic(api_key=api_key)
        self.sync_client = Anthropic(api_key=api_key)

    async def chat(self, message: str, system_prompt: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (async)"""
        messages = self.conversation_history.copy()
        messages.append({"role": "user", "content": message})
        
        # Format system prompt for newer Anthropic API
        system_param = None
        if system_prompt:
            system_param = [{"type": "text", "text": system_prompt}]
        
        response = await self.async_client.messages.create(
            model=self.model,
            max_tokens=1000,
            temperature=self.temperature,
            system=system_param,
            messages=messages
        )
        
        assistant_message = response.content[0].text
        self.conversation_history.extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": assistant_message}
        ])
        
        return assistant_message

    def chat_sync(self, message: str, system_prompt: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (synchronous)"""
        messages = self.conversation_history.copy()
        messages.append({"role": "user", "content": message})
        
        # Format system prompt for newer Anthropic API
        system_param = None
        if system_prompt:
            system_param = [{"type": "text", "text": system_prompt}]
        
        response = self.sync_client.messages.create(
            model=self.model,
            max_tokens=1000,
            temperature=self.temperature,
            system=system_param,
            messages=messages
        )
        
        assistant_message = response.content[0].text
        self.conversation_history.extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": assistant_message}
        ])
        
        return assistant_message

    def clear_history(self) -> None:
        """Clear conversation history"""
        self.conversation_history = []

    def get_history(self) -> List[Dict[str, str]]:
        """Get conversation history"""
        return self.conversation_history

    async def translate_text(self, text: str, target_language: str, 
                           audience: str, style: str, 
                           context: str) -> str:
        """Translate text to target language with specific audience and style"""
        system_prompt = f"""You are an expert Bible translator with deep knowledge of linguistics, theology, and cross-cultural communication. 

Your task is to translate Biblical text with accuracy and cultural sensitivity."""

        user_prompt = f"""Please translate the following {context} into {target_language}.

Original text: "{text}"

Translation requirements:
- Target language: {target_language}
- Target audience: {audience}
- Translation style: {style}
- Maintain theological accuracy
- Use natural, fluent language
- Consider cultural context

Please provide only the translation without explanations or commentary."""

        return await self.chat(user_prompt, system_prompt)

    async def translate_with_examples(self, text: str, target_language: str, 
                                    audience: str, style: str, 
                                    examples: str) -> str:
        """Translate text using example translation pairs for context"""
        system_prompt = f"""You are an expert Bible translator with deep knowledge of linguistics, theology, and cross-cultural communication. 

You will use provided translation examples to understand the translation patterns and style needed for this specific language project."""

        user_prompt = f"""Please translate the following text into {target_language} using the provided examples as guidance.

TRANSLATION EXAMPLES:
{examples}

TARGET TEXT TO TRANSLATE: "{text}"

Translation requirements:
- Target language: {target_language}
- Target audience: {audience}
- Translation style: {style}
- Follow the translation patterns shown in the examples
- Maintain consistency with the example translations
- Use similar vocabulary and phrasing style when appropriate
- Maintain theological accuracy

Please provide only the translation without explanations or commentary."""

        return await self.chat(user_prompt, system_prompt)
