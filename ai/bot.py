from typing import Optional, Dict, Any, List
import os
import re
import litellm
from litellm import acompletion, completion

def extract_translation_from_xml(response: str) -> str:
    """Extract translation from XML tags, fallback to full response if no tags found"""
    match = re.search(r'<translation>(.*?)</translation>', response, re.DOTALL)
    if match:
        return match.group(1).strip()
    else:
        # Fallback: if no XML tags found, return the whole response stripped
        return response.strip()

class Chatbot:
    def __init__(self, model: str = "gpt-4o", temperature: float = 0.5):
        self.model = model
        self.temperature = temperature
        self.conversation_history: List[Dict[str, str]] = []
        
        # Set up API keys for LiteLLM
        if os.getenv('OPENAI_API_KEY'):
            litellm.openai_key = os.getenv('OPENAI_API_KEY')
        if os.getenv('ANTHROPIC_API_KEY'):
            litellm.anthropic_key = os.getenv('ANTHROPIC_API_KEY')
        
        # Configure LiteLLM settings
        litellm.set_verbose = False

    async def chat(self, message: str, system_prompt: Optional[str] = None, model: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (async)"""
        messages = []
        
        # Add system message if provided
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        messages.extend(self.conversation_history)
        messages.append({"role": "user", "content": message})
        
        # Use provided model or fall back to instance model
        use_model = model or self.model
        
        response = await acompletion(
            model=use_model,
            temperature=self.temperature,
            messages=messages
        )
        
        assistant_message = response.choices[0].message.content
        if assistant_message is None:
            assistant_message = ""
        
        self.conversation_history.extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": assistant_message}
        ])
        
        return assistant_message

    def chat_sync(self, message: str, system_prompt: Optional[str] = None, model: Optional[str] = None) -> str:
        """Send a message to the chatbot and get a response (synchronous)"""
        messages = []
        
        # Add system message if provided
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        messages.extend(self.conversation_history)
        messages.append({"role": "user", "content": message})
        
        # Use provided model or fall back to instance model
        use_model = model or self.model
        
        response = completion(
            model=use_model,
            temperature=self.temperature,
            messages=messages
        )
        
        assistant_message = response.choices[0].message.content
        if assistant_message is None:
            assistant_message = ""
        
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

    def _create_translation_prompt(self, text: str, target_language: str, audience: str, 
                                 style: str, context: str, examples: str = None) -> str:
        """Create translation prompt with optional examples"""
        if examples:
            return f"""Please translate the following text into {target_language} using the provided examples as guidance.

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

Provide your final translation inside <translation></translation> tags."""
        else:
            return f"""Please translate the following {context} into {target_language}.

Original text: "{text}"

Translation requirements:
- Target language: {target_language}
- Target audience: {audience}
- Translation style: {style}
- Maintain theological accuracy
- Use natural, fluent language
- Consider cultural context

Provide your final translation inside <translation></translation> tags."""

    async def translate_text(self, text: str, target_language: str, 
                           audience: str, style: str, 
                           context: str, model: Optional[str] = None) -> str:
        """Translate text to target language with specific audience and style"""
        system_prompt = f"""You are an expert Bible translator with deep knowledge of linguistics, theology, and cross-cultural communication. 

Your task is to translate Biblical text with accuracy and cultural sensitivity."""

        user_prompt = self._create_translation_prompt(text, target_language, audience, style, context)
        response = await self.chat(user_prompt, system_prompt, model)
        return extract_translation_from_xml(response)

    async def translate_with_examples(self, text: str, target_language: str, 
                                    audience: str, style: str, 
                                    examples: str, model: Optional[str] = None) -> str:
        """Translate text using example translation pairs for context"""
        system_prompt = f"""You are an expert Bible translator with deep knowledge of linguistics, theology, and cross-cultural communication. 

You will use provided translation examples to understand the translation patterns and style needed for this specific language project."""

        user_prompt = self._create_translation_prompt(text, target_language, audience, style, "text", examples)
        response = await self.chat(user_prompt, system_prompt, model)
        return extract_translation_from_xml(response)
