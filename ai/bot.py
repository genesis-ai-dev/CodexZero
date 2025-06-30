from typing import Optional, Dict, Any, List
import os
from openai import AsyncOpenAI, OpenAI

class Chatbot:
    def __init__(self, model: str = "gpt-4o", temperature: float = 0.5):
        self.model = model
        self.temperature = temperature
        self.conversation_history: List[Dict[str, str]] = []
        
        # Initialize OpenAI clients with API key from environment
        api_key = os.getenv('OPENAI_API_KEY')
        self.async_client = AsyncOpenAI(api_key=api_key)
        self.sync_client = OpenAI(api_key=api_key)

    async def chat(self, message: str, system_prompt: Optional[str] = None, model: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (async)"""
        messages = self.conversation_history.copy()
        
        # Add system message if provided
        if system_prompt:
            messages.insert(0, {"role": "system", "content": system_prompt})
            
        messages.append({"role": "user", "content": message})
        
        # Use provided model or fall back to instance model
        use_model = model or self.model
        
        response = await self.async_client.chat.completions.create(
            model=use_model,
            temperature=self.temperature,
            messages=messages
        )
        
        assistant_message = response.choices[0].message.content
        self.conversation_history.extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": assistant_message}
        ])
        
        return assistant_message

    def chat_sync(self, message: str, system_prompt: Optional[str] = None, model: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (synchronous)"""
        messages = self.conversation_history.copy()
        
        # Add system message if provided
        if system_prompt:
            messages.insert(0, {"role": "system", "content": system_prompt})
            
        messages.append({"role": "user", "content": message})
        
        # Use provided model or fall back to instance model
        use_model = model or self.model
        
        response = self.sync_client.chat.completions.create(
            model=use_model,
            temperature=self.temperature,
            messages=messages
        )
        
        assistant_message = response.choices[0].message.content
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
                           context: str, model: Optional[str] = None) -> str:
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

        return await self.chat(user_prompt, system_prompt, model)

    async def translate_with_examples(self, text: str, target_language: str, 
                                    audience: str, style: str, 
                                    examples: str, model: Optional[str] = None) -> str:
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

        return await self.chat(user_prompt, system_prompt, model)
