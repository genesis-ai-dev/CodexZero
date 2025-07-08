import os
import json
import random
import threading
import io
import chardet
from flask import Blueprint, render_template, request, jsonify, send_file, redirect
from flask_login import login_required, current_user
from thefuzz import fuzz
from datetime import datetime
from typing import Tuple, List, Dict, Any

from models import Project, Translation, ProjectFile, db
from ai.bot import Chatbot, extract_translation_from_xml
from ai.contextquery import ContextQuery, MemoryContextQuery
from utils.translation_manager import VerseReferenceManager, TranslationFileManager
from storage import get_storage

translation = Blueprint('translation', __name__)

# Create a lock for each file to prevent concurrent writes
file_locks = {}

def _parse_source_filenames(job):
    """Parse source filenames from job with proper error handling"""
    try:
        source_files = json.loads(job.source_filenames) if job.source_filenames else []
        return ', '.join(source_files) if source_files else 'Unknown'
    except (json.JSONDecodeError, TypeError) as e:
        print(f"Failed to parse source filenames: {e}")
        return 'Unknown'



@translation.route('/project/<int:project_id>/translate')
@login_required
def translate_page(project_id):
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Load book chapters data
    import json
    import os
    
    book_chapters_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'book_chapters.json')
    with open(book_chapters_path, 'r') as f:
        book_chapters = json.load(f)
    
    return render_template('translate.html', 
                         project=project,
                         book_chapters=book_chapters)




def _get_translation_examples(project_id, source_file_id, target_file_id, query_text, exclude_verse_index=None):
    """Get examples using source and target files with context query"""
    print(f"DEBUG: Getting examples for query: '{query_text}'")
    print(f"DEBUG: source_file_id: {source_file_id}, target_file_id: {target_file_id}")
    
    if not query_text:
        return [], "No query text provided"
    
    # Load source content
    source_lines = []
    if source_file_id.startswith('file_'):
        file_id = int(source_file_id.replace('file_', ''))
        project_file = ProjectFile.query.filter_by(id=file_id, project_id=project_id).first()
        if project_file:
            storage = get_storage()
            file_content = storage.get_file(project_file.storage_path)
            content = simple_decode_utf8(file_content)
            source_lines = content.split('\n')
            print(f"DEBUG: Loaded source file with {len(source_lines)} lines")
        else:
            print(f"DEBUG: Source file not found: {file_id}")
    elif source_file_id.startswith('translation_'):
        translation_id = int(source_file_id.replace('translation_', ''))
        translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first()
        if translation:
            translation_manager = TranslationFileManager(translation.storage_path)
            source_lines = translation_manager.load_translation_file()
            print(f"DEBUG: Loaded source translation with {len(source_lines)} lines")
        else:
            print(f"DEBUG: Source translation not found: {translation_id}")
    
    # Load target content
    target_lines = []
    if target_file_id.startswith('file_'):
        file_id = int(target_file_id.replace('file_', ''))
        project_file = ProjectFile.query.filter_by(id=file_id, project_id=project_id).first()
        if project_file:
            storage = get_storage()
            file_content = storage.get_file(project_file.storage_path)
            content = simple_decode_utf8(file_content)
            target_lines = content.split('\n')
            print(f"DEBUG: Loaded target file with {len(target_lines)} lines")
        else:
            print(f"DEBUG: Target file not found: {file_id}")
    elif target_file_id.startswith('translation_'):
        translation_id = int(target_file_id.replace('translation_', ''))
        translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first()
        if translation:
            translation_manager = TranslationFileManager(translation.storage_path)
            target_lines = translation_manager.load_translation_file()
            print(f"DEBUG: Loaded target translation with {len(target_lines)} lines")
        else:
            print(f"DEBUG: Target translation not found: {translation_id}")
    
    # Validate content
    if not source_lines or not target_lines:
        print(f"DEBUG: Missing content - source_lines: {len(source_lines) if source_lines else 0}, target_lines: {len(target_lines) if target_lines else 0}")
        return [], "No valid source or target content found"
    
    # Handle length differences - allow up to 1000 line difference for Bible texts
    line_diff = abs(len(source_lines) - len(target_lines))
    if line_diff > 1000:
        print(f"DEBUG: Length mismatch too large: {len(source_lines)} vs {len(target_lines)} (diff: {line_diff})")
        return [], f"Source and target files have different lengths: {len(source_lines)} vs {len(target_lines)}"
    
    # Always ensure exactly the same line count for MemoryContextQuery
    if len(source_lines) != len(target_lines):
        min_len = min(len(source_lines), len(target_lines))
        print(f"DEBUG: Line count difference of {line_diff} is acceptable. Adjusting lengths from {len(source_lines)}/{len(target_lines)} to {min_len}")
        source_lines = source_lines[:min_len]
        target_lines = target_lines[:min_len]
    else:
        print(f"DEBUG: Perfect line count match: {len(source_lines)} lines")
    
    # Final verification
    if len(source_lines) != len(target_lines):
        print(f"DEBUG: ERROR - Still have mismatched lengths after adjustment: {len(source_lines)} vs {len(target_lines)}")
        return [], "Failed to align source and target files"
    
    # Check for non-empty content
    non_empty_source = [line for line in source_lines if line.strip()]
    non_empty_target = [line for line in target_lines if line.strip()]
    print(f"DEBUG: Non-empty lines - source: {len(non_empty_source)}, target: {len(non_empty_target)}")
    
    # Use context query for examples
    print(f"DEBUG: Creating MemoryContextQuery with {len(source_lines)} source and {len(target_lines)} target lines")
    try:
        cq = MemoryContextQuery(source_lines, target_lines)
        print(f"DEBUG: Searching for query: '{query_text}' with coverage-based stopping (min=3, threshold=0.9)")
        results = cq.search_by_text(query_text, top_k=10, min_examples=3, coverage_threshold=0.9)
        print(f"DEBUG: MemoryContextQuery returned {len(results)} results")
        
        for i, (verse_id, source_text, target_text, coverage) in enumerate(results[:3]):  # Show first 3
            print(f"DEBUG: Result {i}: verse_id={verse_id}, coverage={coverage}, source='{source_text[:50]}...', target='{target_text[:50]}...'")
    except Exception as e:
        print(f"DEBUG: Error in MemoryContextQuery: {e}")
        return [], f"Error in context query: {str(e)}"
    
    examples = []
    excluded_count = 0
    for verse_id, source_text, target_text, coverage in results:
        # Skip the verse we're testing if exclude_verse_index is specified
        # Note: MemoryContextQuery returns 1-based verse_id, but exclude_verse_index is 0-based
        if exclude_verse_index is not None and verse_id == (exclude_verse_index + 1):
            excluded_count += 1
            print(f"DEBUG: Excluding verse {verse_id} (0-based index {exclude_verse_index}) from examples (test mode)")
            continue
        examples.append(target_text.strip())
    
    status_msg = f"Found {len(examples)} examples using context query"
    if excluded_count > 0:
        status_msg += f" (excluded {excluded_count} ground truth verses)"
    
    print(f"DEBUG: Final examples count: {len(examples)}")
    return examples, status_msg

def translate_text(project_id: int, text: str, model: str = None, temperature: float = 0.2, 
                  source_file_id: str = None, target_file_id: str = None) -> Dict[str, Any]:
    """
    Translate text using the specified model and project settings.
    Returns translation with metadata including confidence and examples used.
    """
    
    # Get project details
    project = Project.query.get(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")
    
    # Use project's default model if none specified
    if not model:
        model = project.default_model
    
    # Get translation examples if file IDs are provided
    examples = []
    status_msg = ""
    
    if source_file_id and target_file_id:
        # Only get examples for base models (not fine-tuned models)
        if not model.startswith('ft:'):
            examples, status_msg = _get_translation_examples(
                project_id, source_file_id, target_file_id, text
            )
    
    # Get instructions - pair-specific first, then project fallback
    instructions = _get_translation_instructions(project_id, source_file_id, target_file_id, project)
    
    # Create system prompt with instructions
    system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
    
    if instructions:
        system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
    
    # Create user prompt with examples if available
    if examples:
        context_parts = ["TRANSLATION EXAMPLES:"]
        context_parts.extend(examples)
        context_parts.append("")
        context_parts.append("Following the style and patterns shown in the examples above:")
        context_parts.append(f"Translate this text: {text}")
        context_parts.append("")
        context_parts.append("Provide your final translation inside <translation></translation> tags.")
        
        user_prompt = '\n'.join(context_parts)
    else:
        user_prompt = f"Translate this text: {text}\n\nProvide your final translation inside <translation></translation> tags."

    chatbot = Chatbot(temperature=temperature)
    response = chatbot.chat_sync(user_prompt, system_prompt, model=model)
    
    # Extract translation from XML tags
    translation = extract_translation_from_xml(response)
    
    return {
        'translation': translation,
        'model': model,
        'status_msg': status_msg,
        'examples_used': len(examples),
        'temperature': temperature,
        'project_id': project_id,
        'instructions_used': instructions is not None
    }


def _get_file_context(project_id: int, target_file_id: str = None) -> str:
    """Get context from target file with its purpose"""
    from models import ProjectFile
    
    if not target_file_id:
        return ""
    
    # Extract file ID from target_file_id string
    if target_file_id.startswith('file_'):
        file_id = int(target_file_id.replace('file_', ''))
        target_file = ProjectFile.query.filter_by(id=file_id, project_id=project_id).first()
        
        if target_file:
            if target_file.purpose_description and target_file.purpose_description.strip():
                return f"Target file context: {target_file.purpose_description.strip()}"
            elif target_file.file_purpose and target_file.file_purpose.strip():
                # Convert file_purpose to readable format
                purpose = target_file.file_purpose.replace('_', ' ').title()
                return f"Target file context: {purpose}"
    
    return ""

def _get_translation_instructions(project_id: int, source_file_id: str, target_file_id: str, project) -> str:
    """Get translation instructions including file context and project instructions"""
    
    instruction_parts = []
    
    # Add target file context only
    file_context = _get_file_context(project_id, target_file_id)
    if file_context:
        instruction_parts.append(file_context)
    
    # Add project instructions
    if project.instructions and project.instructions.strip():
        instruction_parts.append(project.instructions.strip())
    
    return "\n\n".join(instruction_parts) if instruction_parts else None


def _get_verse_content(project_id, file_id, verse_index):
    """Get content for a specific verse index"""
    if file_id.startswith('file_'):
        file_id_int = int(file_id.replace('file_', ''))
        project_file = ProjectFile.query.filter_by(id=file_id_int, project_id=project_id).first()
        if not project_file:
            return ""
        
        storage = get_storage()
        file_content = storage.get_file(project_file.storage_path)
        content = simple_decode_utf8(file_content)
        lines = content.split('\n')
        return lines[verse_index] if verse_index < len(lines) else ""
        
    elif file_id.startswith('translation_'):
        translation_id = int(file_id.replace('translation_', ''))
        translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first()
        if not translation:
            return ""
        
        translation_manager = TranslationFileManager(translation.storage_path)
        lines = translation_manager.load_translation_file()
        return lines[verse_index] if verse_index < len(lines) else ""
    
    return ""

def simple_decode_utf8(file_content):
    """Auto-detect encoding to preserve all characters with zero information loss"""
    detected = chardet.detect(file_content)
    encoding = detected['encoding'] if detected and detected['encoding'] else 'utf-8'
    return file_content.decode(encoding)

def _calculate_similarity_metrics(ai_translation, ground_truth):
    """Calculate CHRF score between AI translation and ground truth"""
    if not ai_translation or not ground_truth:
        return {'error': 'Missing translation or ground truth'}
    
    # Clean texts
    ai_clean = ai_translation.strip()
    truth_clean = ground_truth.strip()
    
    if not truth_clean:
        return {'chrf_score': 0.0}
    
    # Calculate CHRF score
    chrf_score = _compute_chrf_score(ai_clean, truth_clean)
    
    return {
        'chrf_score': round(chrf_score * 100, 1)  # Convert to percentage
    }

def _compute_chrf_score(candidate, reference, max_n=6):
    """Compute CHRF score using character n-grams"""
    from collections import Counter
    
    if not candidate or not reference:
        return 0.0
    
    # Remove spaces for character-level analysis
    candidate_chars = candidate.replace(' ', '')
    reference_chars = reference.replace(' ', '')
    
    if not reference_chars:
        return 0.0
    
    # Calculate precision and recall for character n-grams
    total_precision = 0.0
    total_recall = 0.0
    
    for n in range(1, max_n + 1):
        # Get character n-grams
        candidate_ngrams = _get_char_ngrams(candidate_chars, n)
        reference_ngrams = _get_char_ngrams(reference_chars, n)
        
        if not candidate_ngrams and not reference_ngrams:
            continue
        
        if not candidate_ngrams:
            precision = 0.0
        else:
            candidate_counts = Counter(candidate_ngrams)
            reference_counts = Counter(reference_ngrams)
            
            matches = sum(min(candidate_counts[ngram], reference_counts[ngram]) 
                         for ngram in candidate_counts)
            precision = matches / len(candidate_ngrams)
        
        if not reference_ngrams:
            recall = 0.0
        else:
            candidate_counts = Counter(candidate_ngrams)
            reference_counts = Counter(reference_ngrams)
            
            matches = sum(min(candidate_counts[ngram], reference_counts[ngram]) 
                         for ngram in reference_counts)
            recall = matches / len(reference_ngrams)
        
        total_precision += precision
        total_recall += recall
    
    # Average precision and recall
    avg_precision = total_precision / max_n
    avg_recall = total_recall / max_n
    
    # F1 score
    if avg_precision + avg_recall == 0:
        return 0.0
    
    chrf_score = 2 * avg_precision * avg_recall / (avg_precision + avg_recall)
    return chrf_score

def _get_char_ngrams(text, n):
    """Extract character n-grams from text"""
    if len(text) < n:
        return []
    return [text[i:i+n] for i in range(len(text) - n + 1)]





@translation.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        text_to_translate = data.get('text', '').strip()
        target_language = data.get('target_language', '').strip()
        project_id = data.get('project_id')
        source_file_id = data.get('source_file_id')
        target_file_id = data.get('target_file_id')
        
        # New parameters for model configuration
        temperature = data.get('temperature', 0.2)  # Default to 0.2 for more consistent translations
        use_examples = data.get('use_examples', True)  # Default to True
        
        # Test mode parameters
        is_test_mode = data.get('is_test_mode', False)
        ground_truth = data.get('ground_truth', '').strip()
        exclude_verse_index = data.get('exclude_verse_index')
        
        if not text_to_translate:
            return jsonify({'success': False, 'error': 'No text provided'})
        
        if not target_language:
            return jsonify({'success': False, 'error': 'No target language provided'})
        
        if not source_file_id or not target_file_id or not project_id:
            return jsonify({'success': False, 'error': 'Source and target files required'})
        
        # Validate temperature
        try:
            temperature = float(temperature)
            if not (0.0 <= temperature <= 2.0):
                temperature = 0.2  # Default fallback
        except (ValueError, TypeError):
            temperature = 0.2  # Default fallback
        
        # Get project to access translation model
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'})
        
        # Get the current translation model for this project
        translation_model = project.get_current_translation_model()
        
        # Get examples from the two files if use_examples is True
        examples = []
        source_info = "No examples used"
        
        # Log the use_examples setting for debugging
        print(f"Translation request - use_examples: {use_examples}, text: '{text_to_translate[:50]}...'")
        
        if use_examples:
            examples, source_info = _get_translation_examples(
                project_id, source_file_id, target_file_id, text_to_translate, exclude_verse_index
            )
            print(f"Found {len(examples)} examples for in-context learning")
        else:
            print("In-context learning disabled - no examples will be used")
        
        # Generate translation using project's selected model
        translation = _generate_translation_with_examples(
            text_to_translate, 
            target_language, 
            examples,
            [source_info],
            model=translation_model,
            temperature=temperature
        )
        
        # Calculate confidence metrics
        confidence_data = _calculate_translation_confidence(translation, examples)
        
        # Test mode: calculate similarity with ground truth
        test_results = None
        if is_test_mode and ground_truth:
            test_results = _calculate_similarity_metrics(translation, ground_truth)
        
        response_data = {
            'success': True,
            'translation': translation,
            'examples_used': len(examples),
            'sources': [source_info],
            'confidence': confidence_data,
            'model_used': translation_model,
            'temperature': temperature,
            'used_examples': use_examples
        }
        
        if test_results:
            response_data['test_mode'] = True
            response_data['ground_truth'] = ground_truth
            response_data['similarity'] = test_results
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)})

def _calculate_translation_confidence(translation, examples):
    """Calculate confidence metrics by finding fuzzy matching substrings in examples"""
    if not examples or not translation:
        return {'segments': [], 'overall_confidence': 0}
    
    # Extract target text from examples (now examples are just target text)
    target_texts_with_source = []
    for example in examples:
        target_text = example.strip()
        if target_text:  # Only include non-empty examples
            target_texts_with_source.append({
                'text': target_text.lower(),
                'original': target_text,
                'english': ''  # No source text available anymore
            })
    
    if not target_texts_with_source:
        return {'segments': [], 'overall_confidence': 0}
    
    print(f"Processing translation: '{translation}' with {len(target_texts_with_source)} example texts")
    
    translation_lower = translation.lower()
    covered_positions = set()
    segments = []
    
    # Find all possible substrings and their matches
    substring_matches = []
    
    for start in range(len(translation_lower)):
        if start in covered_positions:
            continue
            
        best_length = 0
        best_match = None
        best_sources = []
        
        # Try progressively longer substrings from this position
        for end in range(start + 1, len(translation_lower) + 1):
            if any(pos in covered_positions for pos in range(start, end)):
                break
                
            substring = translation_lower[start:end]
            
            # Simplified: Find exact matches
            for target_info in target_texts_with_source:
                if substring in target_info['text']:
                    # Found a match. Is it the longest one so far?
                    if len(substring) > best_length:
                        best_length = len(substring)
                        best_match = substring
                        
                        # This is a new best match, so create a new source list
                        match_start_index = target_info['text'].find(substring)
                        source_with_match_info = target_info.copy()
                        source_with_match_info['match_start'] = match_start_index
                        source_with_match_info['match_end'] = match_start_index + len(substring)
                        best_sources = [source_with_match_info]

                    elif len(substring) == best_length:
                        # Same length, add as another source if not present
                        if not any(d['original'] == target_info['original'] for d in best_sources):
                            match_start_index = target_info['text'].find(substring)
                            source_with_match_info = target_info.copy()
                            source_with_match_info['match_start'] = match_start_index
                            source_with_match_info['match_end'] = match_start_index + len(substring)
                            best_sources.append(source_with_match_info)
        
        if best_match and best_length > 3:
            # Mark these positions as covered
            for pos in range(start, start + len(best_match)):
                covered_positions.add(pos)
            
            substring_matches.append({
                'start': start,
                'end': start + len(best_match),
                'length': len(best_match),
                'text': translation[start:start + len(best_match)],
                'sources': best_sources[:3] # Limit to top 3 sources
            })
    
    # Filter out dominated matches (a smaller match fully inside a larger one)
    final_matches = []
    for i, match in enumerate(substring_matches):
        is_dominated = False
        for j, other_match in enumerate(substring_matches):
            if i == j: continue
            # If match is inside other_match
            if other_match['start'] <= match['start'] and other_match['end'] >= match['end'] and other_match['length'] > match['length']:
                is_dominated = True
                break
        if not is_dominated:
            final_matches.append(match)
    
    # Sort matches by position
    final_matches.sort(key=lambda x: x['start'])
    
    # Create segments for the entire translation
    current_pos = 0
    
    for match in final_matches:
        # Add uncovered text before this match
        if current_pos < match['start']:
            segments.append({
                'text': translation[current_pos:match['start']],
                'confidence': 0,
                'start': current_pos,
                'end': match['start'],
                'sources': []
            })
        
        # Add the matched segment with algorithmic confidence scoring
        length = match['length']
        
        # Algorithmic confidence calculation based on match characteristics
        # 1. Base score from length (logarithmic scale for diminishing returns)
        import math
        base_score = min(80, 20 * math.log(length + 1))
        
        # 2. Word completeness bonus (matching complete words is better)
        match_text = match['text'].strip()
        words = match_text.split()
        if len(words) > 0:
            # Bonus for matching complete words vs partial words
            word_completeness = len([w for w in words if len(w) >= 3]) / len(words)
            base_score += 15 * word_completeness
        
        # 3. Context richness (longer phrases in context are more reliable)
        if length >= 8:  # Multi-word phrases
            context_bonus = min(10, (length - 8) * 0.5)
            base_score += context_bonus
        
        # 4. Source reliability (multiple sources agreeing increases confidence)
        source_count = len(match.get('sources', []))
        if source_count > 1:
            source_bonus = min(5, source_count * 1.5)
            base_score += source_bonus
        
        base_confidence = min(100, int(base_score))
        
        segments.append({
            'text': match['text'],
            'confidence': base_confidence,
            'start': match['start'],
            'end': match['end'],
            'sources': match['sources']
        })
        
        current_pos = match['end']
    
    # Add any remaining uncovered text
    if current_pos < len(translation):
        segments.append({
            'text': translation[current_pos:],
            'confidence': 0,
            'start': current_pos,
            'end': len(translation),
            'sources': []
        })
    
    # Calculate overall confidence
    total_covered_length = sum(m['length'] for m in final_matches)
    total_chars = len(translation)
    overall_confidence = int((total_covered_length / total_chars) * 100) if total_chars > 0 else 0
    
    return {
        'segments': segments,
        'overall_confidence': overall_confidence,
        'coverage_stats': {
            'total_chars': total_chars,
            'covered_chars': total_covered_length,
            'uncovered_chars': total_chars - total_covered_length
        }
    }

def _generate_translation_with_examples(text, target_language, examples, source_descriptions, model=None, temperature=0.7):
    """Generates a translation using the AI with examples, matching fine-tuning structure exactly."""
    
    # Get project info to create the exact same system prompt as fine-tuning
    project_id = request.json.get('project_id') if request and request.json else None
    project = Project.query.get(project_id) if project_id else None
    
    if project:
        # Get source and target file IDs for instruction lookup
        source_file_id = request.json.get('source_file_id') if request and request.json else None
        target_file_id = request.json.get('target_file_id') if request and request.json else None
        
        # Get instructions - pair-specific first, then project fallback
        instructions = _get_translation_instructions(project_id, source_file_id, target_file_id, project)
        
        # Use exact same system prompt structure as fine-tuning
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
    else:
        # Fallback system prompt if project not available
        system_prompt = f"You are an expert Bible translator specializing in {target_language} translation. Translate biblical text accurately while maintaining the meaning and tone of the original text."
    
    # Use exact same user prompt structure as fine-tuning
    if examples:
        # When examples are provided, include them in the user prompt for context
        context_parts = ["TRANSLATION EXAMPLES:"]
        context_parts.extend(examples)
        context_parts.append("")
        context_parts.append("Following the style and patterns shown in the examples above:")
        context_parts.append(f"Translate this text: {text}")
        context_parts.append("")
        context_parts.append("Provide your final translation inside <translation></translation> tags.")
        
        user_prompt = '\n'.join(context_parts)
    else:
        # When no examples, use the exact same structure as fine-tuning
        user_prompt = f"Translate this text: {text}\n\nProvide your final translation inside <translation></translation> tags."

    chatbot = Chatbot(temperature=temperature)
    response = chatbot.chat_sync(user_prompt, system_prompt, model=model)
    
    # Extract translation from XML tags
    import re
    match = re.search(r'<translation>(.*?)</translation>', response, re.DOTALL)
    if match:
        return match.group(1).strip()
    else:
        # Fallback: if no XML tags found, return the whole response stripped
        return response.strip()


# ===== NEW TRANSLATION EDITOR ENDPOINTS =====

@translation.route('/project/<int:project_id>/translations/<int:translation_id>/download')
@login_required
def download_translation(project_id, translation_id):
    """Download a translation file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
    
    storage = get_storage()
    
    try:
        # Get translation file content
        file_content = storage.get_file(translation.storage_path)
        
        # Create a safe filename
        safe_name = "".join(c for c in translation.name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_')
        filename = f"{safe_name}.txt"
        
        # For local storage, serve file directly with download headers
        if hasattr(storage, 'base_path'):  # LocalStorage
            return send_file(
                io.BytesIO(file_content), 
                as_attachment=True, 
                download_name=filename,
                mimetype='text/plain'
            )
        else:  # Cloud storage
            # For cloud storage, redirect to a signed URL for download
            return redirect(storage.get_file_url(translation.storage_path))
    except Exception as e:
        return jsonify({'error': f'Translation download failed: {str(e)}'}), 500

@translation.route('/project/<int:project_id>/translations/<int:translation_id>/purpose', methods=['POST'])
@login_required
def update_translation_purpose(project_id, translation_id):
    """Update the purpose description for a translation"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
    
    data = request.get_json()
    description = data.get('description', '').strip()
    
    # Validate description length
    if len(description) > 1000:
        return jsonify({'error': 'Purpose description must be 1000 characters or less'}), 400
    
    # Update the translation description
    translation.description = description if description else None
    
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Updated purpose for {translation.name}'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update purpose: {str(e)}'}), 500

@translation.route('/project/<int:project_id>/translations/<int:translation_id>', methods=['DELETE'])
@login_required
def delete_translation(project_id, translation_id):
    """Delete a translation"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
    
    # Delete from storage (if file exists)
    storage = get_storage()
    try:
        storage.delete_file(translation.storage_path)
    except Exception as e:
        # Log the error but continue with database deletion
        print(f"Warning: Could not delete translation from storage: {e}")
        # This is not a fatal error - the file might already be deleted
    
    # Delete translation from database
    db.session.delete(translation)
    db.session.commit()
    
    return '', 204  # No content response

@translation.route('/project/<int:project_id>/texts')
@login_required
def list_all_texts(project_id):
    """List all available texts (eBible files + text files + back translations + all translations) - unified endpoint"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    texts = []
    
    # Add eBible files
    ebible_files = ProjectFile.query.filter_by(
        project_id=project_id,
        file_type='ebible'
    ).all()
    
    for file in ebible_files:
        texts.append({
            'id': f"file_{file.id}",
            'name': file.original_filename,
            'type': 'eBible File',
            'progress': 100,  # eBible files are always complete
            'created_at': file.created_at.isoformat()
        })
    
    # Add regular text files
    text_files = ProjectFile.query.filter_by(
        project_id=project_id,
        file_type='text'
    ).all()
    
    for file in text_files:
        texts.append({
            'id': f"file_{file.id}",
            'name': file.original_filename,
            'type': 'Text File',
            'progress': 100,  # Text files are complete when uploaded
            'created_at': file.created_at.isoformat()
        })
    
    # Add back translation files
    back_translation_files = ProjectFile.query.filter_by(
        project_id=project_id,
        file_type='back_translation'
    ).all()
    
    for file in back_translation_files:
        texts.append({
            'id': f"file_{file.id}",
            'name': file.original_filename,
            'type': 'Back Translation',
            'progress': 100,  # Back translation files are complete when created
            'created_at': file.created_at.isoformat()
        })
    
    # Add all translations
    translations = Translation.query.filter_by(project_id=project_id).all()
    for translation in translations:
        translation_manager = TranslationFileManager(translation.storage_path)
        translated_count, progress_percentage = translation_manager.calculate_progress()
        
        texts.append({
            'id': f"translation_{translation.id}",
            'name': translation.name,
            'type': 'Translation',
            'progress': round(progress_percentage, 1),
            'created_at': translation.created_at.isoformat()
        })
    
    # Sort by creation date (newest first)
    texts.sort(key=lambda x: x['created_at'], reverse=True)
    
    return jsonify({'texts': texts})


@translation.route('/project/<int:project_id>/translations', methods=['POST'])
@login_required  
def create_translation(project_id):
    """Create new translation"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': 'Translation name is required'}), 400
    
    if len(name) > 255:
        return jsonify({'error': 'Translation name too long'}), 400
    
    # Check if name already exists for this project
    existing = Translation.query.filter_by(project_id=project_id, name=name).first()
    if existing:
        return jsonify({'error': 'Translation name already exists'}), 400
    
    try:
        # Create new translation file
        storage_path = TranslationFileManager.create_new_translation_file(project_id, name)
        
        # Create database record - simple defaults
        translation = Translation(
            project_id=project_id,
            name=name,
            storage_path=storage_path,
            translation_type='draft'  # default to draft
        )
        
        db.session.add(translation)
        db.session.flush()  # Ensure ID and default values are populated
        db.session.commit()  # Save to database
        
        return jsonify({
            'success': True,
            'translation': {
                'id': translation.id,
                'name': translation.name,
                'progress': 0.0,
                'translated_verses': 0,
                'total_verses': translation.total_verses,
                'created_at': translation.created_at.isoformat()
            }
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating translation: {e}")
        return jsonify({'error': 'Failed to create translation'}), 500








@translation.route('/project/<int:project_id>/translation/<target_id>/chapter/<book>/<int:chapter>')
@login_required
def get_chapter_verses(project_id, target_id, book, chapter):
    """Get all verses for a specific chapter"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    source_id = request.args.get('source_id')
    if not source_id:
        return jsonify({'error': 'source_id is required'}), 400
    
    try:
        # Get verse references for this chapter
        verse_ref_manager = VerseReferenceManager()
        chapter_verses = verse_ref_manager.get_chapter_verses(book, chapter)
        
        if not chapter_verses:
            return jsonify({'error': 'Chapter not found'}), 404
        
        # Get target text and purpose information - handle both translation IDs and file IDs
        target_texts = []
        target_purpose = ''
        if target_id.startswith('file_'):
            # Target is a file (eBible or back translation)
            file_id = int(target_id.replace('file_', ''))
            target_file = ProjectFile.query.filter_by(
                id=file_id,
                project_id=project_id
            ).first_or_404()
            
            # Get purpose description from file
            target_purpose = target_file.purpose_description or ''
            
            storage = get_storage()
            target_file_content = storage.get_file(target_file.storage_path)
            content = simple_decode_utf8(target_file_content)
            target_lines = content.split('\n')
            
            verse_indices = [v['index'] for v in chapter_verses]
            target_texts = [target_lines[i] if i < len(target_lines) else '' for i in verse_indices]
            
        elif target_id.startswith('translation_'):
            # Target is a translation
            translation_id = int(target_id.replace('translation_', ''))
            translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
            
            # Get description from translation
            target_purpose = translation.description or ''
            
            translation_manager = TranslationFileManager(translation.storage_path)
            verse_indices = [v['index'] for v in chapter_verses]
            target_texts = translation_manager.get_chapter_verses(verse_indices)
            
        else:
            # Assume it's a direct translation ID (for backward compatibility)
            try:
                translation_id = int(target_id)
                translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
                
                # Get description from translation
                target_purpose = translation.description or ''
                
                translation_manager = TranslationFileManager(translation.storage_path)
                verse_indices = [v['index'] for v in chapter_verses]
                target_texts = translation_manager.get_chapter_verses(verse_indices)
            except ValueError:
                return jsonify({'error': 'Invalid target_id format'}), 400
        
        # Get source text - handle both file and translation sources
        source_lines = []
        if source_id.startswith('file_'):
            # eBible file source
            file_id = int(source_id.replace('file_', ''))
            source_file = ProjectFile.query.filter_by(
                id=file_id,
                project_id=project_id
            ).first_or_404()
            
            storage = get_storage()
            source_file_content = storage.get_file(source_file.storage_path)
            content = simple_decode_utf8(source_file_content)
            source_lines = content.split('\n')
            
        elif source_id.startswith('translation_'):
            # Translation source
            source_translation_id = int(source_id.replace('translation_', ''))
            source_translation = Translation.query.filter_by(
                id=source_translation_id,
                project_id=project_id
            ).first_or_404()
            
            source_manager = TranslationFileManager(source_translation.storage_path)
            source_lines = source_manager.load_translation_file()
        
        else:
            return jsonify({'error': 'Invalid source_id format'}), 400
        
        # Build response
        verses_data = []
        for i, verse_info in enumerate(chapter_verses):
            source_text = source_lines[verse_info['index']] if verse_info['index'] < len(source_lines) else ''
            target_text = target_texts[i] if i < len(target_texts) else ''
            
            verses_data.append({
                'verse': verse_info['verse'],
                'reference': verse_info['reference'],
                'source_text': source_text,
                'target_text': target_text,
                'index': verse_info['index']
            })
        
        return jsonify({
            'book': book,
            'chapter': chapter,
            'verses': verses_data,
            'source_id': source_id,
            'target_id': target_id,
            'purpose_description': target_purpose,
            'description': target_purpose  # Include both for compatibility
        })
        
    except Exception as e:
        print(f"Error getting chapter verses: {e}")
        return jsonify({'error': 'Failed to load chapter'}), 500


@translation.route('/project/<int:project_id>/translation/<target_id>/verse/<int:verse_index>', methods=['POST'])
@login_required
def save_verse(project_id, target_id, verse_index):
    """Save a single verse"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Verse text is required'}), 400
    
    verse_text = data['text']
    
    # CRITICAL: Strip newlines to maintain line alignment for context queries
    # Replace any newlines with spaces and normalize whitespace
    verse_text = ' '.join(verse_text.split())
    
    try:
        # Handle different target types - all are now editable
        if target_id.startswith('file_'):
            # Target is a file (eBible or back translation) - now editable
            file_id = int(target_id.replace('file_', ''))
            target_file = ProjectFile.query.filter_by(
                id=file_id,
                project_id=project_id
            ).first_or_404()
            
            # Get or create a lock for this file
            file_path = target_file.storage_path
            if file_path not in file_locks:
                file_locks[file_path] = threading.Lock()
            
            # Acquire the lock for this file
            with file_locks[file_path]:
                # Load file, update verse, and save back
                storage = get_storage()
                target_file_content = storage.get_file(target_file.storage_path)
                content = simple_decode_utf8(target_file_content)
                target_lines = content.split('\n')
                
                # Simple corruption check - Bible files should have many thousands of lines
                if len(target_lines) < 30000:
                    print(f"ERROR: File appears corrupted with only {len(target_lines)} lines")
                    return jsonify({'error': f'Target file appears corrupted (only {len(target_lines)} lines). Please re-upload the file.'}), 500
                
                # Validate verse index
                if verse_index < 0 or verse_index >= len(target_lines):
                    return jsonify({'error': f'Invalid verse index: {verse_index}'}), 400
                
                # Update the specific verse (ensure no newlines in the text)
                clean_verse_text = verse_text.replace('\n', ' ').replace('\r', ' ').strip()
                target_lines[verse_index] = clean_verse_text
                
                # Save back to storage
                updated_content = '\n'.join(target_lines)
                import io
                content_bytes = io.BytesIO(updated_content.encode('utf-8'))
                storage.store_file(content_bytes, target_file.storage_path)
            
        elif target_id.startswith('translation_'):
            # Target is a translation
            translation_id = int(target_id.replace('translation_', ''))
            translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
            
            translation_manager = TranslationFileManager(translation.storage_path)
            translation_manager.save_verse(verse_index, verse_text)
            
            # Update progress
            translation.updated_at = datetime.utcnow()
            db.session.commit()
            
        else:
            # Assume it's a direct translation ID (for backward compatibility)
            try:
                translation_id = int(target_id)
                translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
                
                translation_manager = TranslationFileManager(translation.storage_path)
                translation_manager.save_verse(verse_index, verse_text)
                
                # Update progress
                translation.updated_at = datetime.utcnow()
                db.session.commit()
                
            except ValueError:
                return jsonify({'error': 'Invalid target_id format'}), 400
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error saving verse: {e}")
        return jsonify({'error': 'Failed to save verse'}), 500






 