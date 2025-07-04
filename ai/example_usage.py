#!/usr/bin/env python3
"""
Example usage of the updated Chatbot with LiteLLM support for both OpenAI and Anthropic models.
"""

import asyncio
import os
from dotenv import load_dotenv
from bot import Chatbot

# Load environment variables
load_dotenv()

async def main():
    """Demonstrate using the chatbot with different models"""
    
    # Initialize the chatbot
    bot = Chatbot()
    
    # Example 1: Using default model (gpt-4o)
    print("=== Default Model Example ===")
    response = await bot.chat("Hello! Can you tell me about Bible translation?")
    print(f"Response: {response}\n")
    
    # Example 2: Using Claude 3.5 Sonnet (available for translation)
    print("=== Claude 3.5 Sonnet Example ===")
    response = await bot.chat(
        "What are the key principles of Bible translation?",
        model="claude-3-5-sonnet-20241022"
    )
    print(f"Response: {response}\n")
    
    # Example 4: Translation with system prompt
    print("=== Translation Example ===")
    translation = await bot.translate_text(
        text="In the beginning was the Word, and the Word was with God, and the Word was God.",
        target_language="Spanish",
        audience="General Christian audience",
        style="Natural equivalence",
        context="Biblical verse (John 1:1)",
        model="claude-3-5-sonnet-20241022"
    )
    print(f"Translation: {translation}\n")
    
    # Clear conversation history
    bot.clear_history()
    print("Conversation history cleared.")

def sync_example():
    """Example using synchronous methods"""
    print("\n=== Synchronous Example ===")
    bot = Chatbot()
    
    response = bot.chat_sync(
        "What is the importance of cultural context in Bible translation?",
        model="claude-3-5-sonnet-20241022"
    )
    print(f"Sync Response: {response}")

if __name__ == "__main__":
    print("Chatbot Example with LiteLLM Support")
    print("=====================================")
    print("Available models:")
    print("- Translation: Claude 3.5 Sonnet + Fine-tuned GPT-4.1 models")
    print("- Fine-tuning: GPT-4.1 series models only")
    print("- Powered by LiteLLM for seamless provider switching!\n")
    
    # Run async examples
    asyncio.run(main())
    
    # Run sync example
    sync_example() 