import json
from typing import List, Dict, Optional
from anthropic import Anthropic
import os
import re

class BackTranslator:
    def __init__(self):
        self.client = Anthropic(api_key=os.getenv('ANTHROPIC_KEY'))
    
    def prepare_lines_for_translation(self, content: str, context_lines: int = 2) -> List[Dict]:
        """Split content into lines and prepare batch requests with context"""
        # Preserve ALL lines, including blank ones
        all_lines = content.split('\n')
        # Only create translation requests for non-empty lines
        non_empty_lines = [(i, line.strip()) for i, line in enumerate(all_lines) if line.strip()]
        
        batch_requests = []
        
        for batch_idx, (original_line_idx, line) in enumerate(non_empty_lines):
            # Get context lines (before and after) from non-empty lines only
            start_idx = max(0, batch_idx - context_lines)
            end_idx = min(len(non_empty_lines), batch_idx + context_lines + 1)
            
            context_before = [non_empty_lines[i][1] for i in range(start_idx, batch_idx)]
            context_after = [non_empty_lines[i][1] for i in range(batch_idx + 1, end_idx)]
            
            # Build the prompt with context
            prompt_parts = []
            
            if context_before:
                prompt_parts.append("Context before:")
                for ctx_line in context_before:
                    prompt_parts.append(f"  {ctx_line}")
                prompt_parts.append("")
            
            prompt_parts.append("LINE TO TRANSLATE:")
            prompt_parts.append(f"  {line}")
            prompt_parts.append("")
            
            if context_after:
                prompt_parts.append("Context after:")
                for ctx_line in context_after:
                    prompt_parts.append(f"  {ctx_line}")
                prompt_parts.append("")
            
            prompt_parts.extend([
                "Your task: Create a literal, word-for-word back-translation of the LINE TO TRANSLATE into English.",
                "- Preserve the exact word order and structure of the original language",
                "- Use the most direct English equivalent for each word",
                "- Don't make it sound natural in English - keep the foreign structure",
                "- Only translate the marked line, not the context",
                "- Put your back-translation inside <back_translation></back_translation> tags",
                "",
                "Back-translation:"
            ])
            
            full_prompt = "\n".join(prompt_parts)
            
            batch_requests.append({
                "custom_id": f"line_{original_line_idx}",  # Use original line index
                "params": {
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 300,
                    "messages": [
                        {"role": "user", "content": full_prompt}
                    ]
                }
            })
        
        return batch_requests
    
    def submit_batch(self, requests: List[Dict]) -> str:
        """Submit a batch of back-translation requests"""
        try:
            response = self.client.messages.batches.create(
                requests=requests
            )
            return response.id
        except Exception as e:
            raise Exception(f"Failed to submit batch: {str(e)}")
    
    def check_batch_status(self, batch_id: str) -> Dict:
        """Check the status of a batch"""
        try:
            response = self.client.messages.batches.retrieve(batch_id)
            return {
                'id': response.id,
                'status': response.processing_status,
                'request_counts': response.request_counts.__dict__ if response.request_counts else {},
                'created_at': response.created_at,
                'ended_at': getattr(response, 'ended_at', None)
            }
        except Exception as e:
            raise Exception(f"Failed to check batch status: {str(e)}")
    
    def retrieve_batch_results(self, batch_id: str) -> List[Dict]:
        """Retrieve completed batch results"""
        try:
            response = self.client.messages.batches.retrieve(batch_id)
            
            if response.processing_status != 'ended':
                raise Exception(f"Batch not completed yet. Status: {response.processing_status}")
            
            # Get the results
            results_response = self.client.messages.batches.results(batch_id)
            
            # Parse the results
            results = []
            for result in results_response:
                if result.result.type == 'succeeded':
                    content = result.result.message.content[0].text if result.result.message.content else ""
                    
                    # Extract content from XML tags
                    xml_match = re.search(r'<back_translation>(.*?)</back_translation>', content, re.DOTALL)
                    if xml_match:
                        clean_content = xml_match.group(1).strip().replace('\n', ' ')
                    else:
                        clean_content = "RESPONSE FAILED"
                    
                    results.append({
                        'custom_id': result.custom_id,
                        'line_number': int(result.custom_id.split('_')[1]),
                        'back_translation': clean_content,
                        'success': True
                    })
                else:
                    # Handle errors
                    error_msg = result.result.error.message if hasattr(result.result, 'error') else "Unknown error"
                    results.append({
                        'custom_id': result.custom_id,
                        'line_number': int(result.custom_id.split('_')[1]),
                        'error': error_msg,
                        'success': False
                    })
            
            # Sort by line number to maintain order
            results.sort(key=lambda x: x['line_number'])
            return results
            
        except Exception as e:
            raise Exception(f"Failed to retrieve batch results: {str(e)}")
    
    def format_results_for_storage(self, original_lines: List[str], results: List[Dict]) -> List[Dict]:
        """Format results for database storage"""
        formatted_results = []
        
        # Create a lookup dictionary for translation results by line number
        results_lookup = {r['line_number']: r for r in results}
        
        for i, line in enumerate(original_lines):
            if line.strip():  # Non-empty line
                # Find corresponding result
                result = results_lookup.get(i)
                
                if result and result['success']:
                    # Clean any newlines from back translation to ensure one line per translation
                    back_translation = result['back_translation']
                    clean_back_translation = ' '.join(back_translation.strip().split())
                    formatted_results.append({
                        'line_number': i,
                        'original': line,
                        'back_translation': clean_back_translation
                    })
                else:
                    # Handle missing or failed translations
                    error_msg = result['error'] if result else "No result found"
                    formatted_results.append({
                        'line_number': i,
                        'original': line,
                        'back_translation': f"[ERROR: {error_msg}]"
                    })
            else:  # Empty line
                # Preserve blank lines as blank lines in back translation
                formatted_results.append({
                    'line_number': i,
                    'original': line,
                    'back_translation': ""
                })
        
        return formatted_results 