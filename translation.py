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
from typing import Tuple, List, Dict, Any, Optional

from models import Project, Translation, ProjectFile, ProjectFileVerse, TranslationVerse, Text, Verse, db
from ai.bot import Chatbot, extract_translation_from_xml
from ai.contextquery import ContextQuery, MemoryContextQuery, DatabaseContextQuery
from utils.text_manager import TextManager
from utils.project_access import require_project_access
from utils.translation_manager import VerseReferenceManager, TranslationFileManager, TranslationDatabaseManager
from storage import get_storage

translation = Blueprint('translation', __name__)

def _get_translation_manager(translation):
    """Get appropriate translation manager based on storage type"""
    if translation.storage_type == 'database':
        return TranslationDatabaseManager(translation.id)
    else:
        return TranslationFileManager(translation.storage_path)

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
    require_project_access(project_id, "viewer")  # Allow viewers to see the page
    project = Project.query.get_or_404(project_id)
    
    # Load book chapters data
    import json
    import os
    
    book_chapters_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'book_chapters.json')
    with open(book_chapters_path, 'r') as f:
        book_chapters = json.load(f)
    
    # Get user's role for permission checking in the frontend
    user_role = project.get_user_role(current_user.id)
    
    return render_template('translate.html', 
                         project=project,
                         book_chapters=book_chapters,
                         user_role=user_role)




def _get_translation_examples(project_id, source_text_id, target_text_id, query_text, exclude_verse_index=None):
    """Get examples using UNIFIED SCHEMA - dramatically simplified!"""
    print(f"DEBUG: Getting examples for query: '{query_text}'")
    print(f"DEBUG: source_text_id: {source_text_id}, target_text_id: {target_text_id}")
    
    if not query_text:
        return [], "No query text provided"
    
    try:
        from utils.text_manager import get_text_manager
        
        # Parse text IDs (supporting both old and new formats during transition)
        def parse_text_id(text_id_str):
            if text_id_str.startswith('text_'):
                # New unified format
                return int(text_id_str.replace('text_', '')), 'unified'
            elif text_id_str.startswith('file_'):
                # Legacy file format - map to corresponding Text record
                file_id = int(text_id_str.replace('file_', ''))
                # Find the migrated Text record for this file
                from models import Text, ProjectFile
                project_file = ProjectFile.query.get(file_id)
                if project_file:
                    text = Text.query.filter_by(
                        project_id=project_file.project_id,
                        name=project_file.original_filename
                    ).first()
                    return text.id if text else None, 'legacy'
                return None, 'legacy'
            elif text_id_str.startswith('translation_'):
                # Legacy translation format - map to corresponding Text record
                translation_id = int(text_id_str.replace('translation_', ''))
                from models import Text, Translation
                translation = Translation.query.get(translation_id)
                if translation:
                    text = Text.query.filter_by(
                        project_id=translation.project_id,
                        name=translation.name
                    ).first()
                    return text.id if text else None, 'legacy'
                return None, 'legacy'
            return None, 'unknown'
        
        # Get source and target text managers
        source_id, source_type = parse_text_id(source_text_id)
        target_id, target_type = parse_text_id(target_text_id)
        
        if not source_id or not target_id:
            # Fall back to legacy system if unified format not available yet
            print("DEBUG: Falling back to legacy system")
            return _get_translation_examples_legacy(project_id, source_text_id, target_text_id, query_text, exclude_verse_index)
        
        source_manager = get_text_manager(source_id)
        target_manager = get_text_manager(target_id)
        
        # Get non-empty verses from both texts
        source_data = source_manager.get_non_empty_verses()
        target_data = target_manager.get_non_empty_verses()
        
        print(f"DEBUG: Found {len(source_data)} source verses, {len(target_data)} target verses")
        
        # Use context query to find relevant examples
        from ai.contextquery import DatabaseContextQuery
        cq = DatabaseContextQuery(source_data, target_data)
        results = cq.search_by_text(
            query_text, 
            top_k=10, 
            min_examples=3, 
            coverage_threshold=0.9, 
            exclude_idx=exclude_verse_index
        )
        
        examples = []
        for verse_id, source_text, target_text, coverage in results:
            examples.append(target_text.strip())
        
        return examples, f"Found {len(examples)} examples using unified schema"
        
    except Exception as e:
        print(f"Error in simplified context query: {e}")
        # Fall back to legacy system on error
        return _get_translation_examples_legacy(project_id, source_text_id, target_text_id, query_text, exclude_verse_index)


def _get_translation_examples_legacy(project_id, source_text_id, target_text_id, query_text, exclude_verse_index=None):
    """Legacy examples function - for backward compatibility during migration"""
    print(f"DEBUG: Using legacy example retrieval")
    
    # Simplified legacy implementation - just get basic examples
    examples = []
    
    try:
        # Load content from legacy tables
        if source_text_id.startswith('file_'):
            file_id = int(source_text_id.replace('file_', ''))
            from models import ProjectFileVerse
            verses = ProjectFileVerse.query.filter_by(project_file_id=file_id).limit(5).all()
            examples = [v.verse_text for v in verses if v.verse_text.strip()]
        elif source_text_id.startswith('translation_'):
            translation_id = int(source_text_id.replace('translation_', ''))
            from models import TranslationVerse
            verses = TranslationVerse.query.filter_by(translation_id=translation_id).limit(5).all()
            examples = [v.verse_text for v in verses if v.verse_text.strip()]
        
        return examples[:3], f"Found {len(examples)} legacy examples"
        
    except Exception as e:
        print(f"Legacy example retrieval error: {e}")
        return [], "No examples available"

def translate_text(project_id: int, text: str, model: Optional[str] = None, temperature: float = 0.2, 
                  source_file_id: Optional[str] = None, target_file_id: Optional[str] = None) -> Dict[str, Any]:
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
        if model and not model.startswith('ft:'):
            examples, status_msg = _get_translation_examples(
                project_id, source_file_id, target_file_id, text
            )
    
    # Get instructions - pair-specific first, then project fallback
    instructions = _get_translation_instructions(project_id, source_file_id or "", target_file_id or "", project)
    
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


def _get_file_purpose(project_id: int, file_id: str) -> str:
    """Get purpose description for any text type - simplified approach"""
    from models import ProjectFile, Translation, Text
    
    if not file_id:
        return ""
    
    # Extract numeric ID from any format
    try:
        if file_id.startswith(('file_', 'translation_', 'text_')):
            numeric_id = int(file_id.split('_', 1)[1])
        else:
            numeric_id = int(file_id)
    except (ValueError, TypeError):
        return ""
    
    # Check all three tables for purpose description
    # ProjectFile table
    file_obj = ProjectFile.query.filter_by(id=numeric_id, project_id=project_id).first()
    if file_obj:
        if file_obj.purpose_description and file_obj.purpose_description.strip():
            return file_obj.purpose_description.strip()
        elif file_obj.file_purpose and file_obj.file_purpose.strip():
            return file_obj.file_purpose.replace('_', ' ').title()
    
    # Translation table
    translation = Translation.query.filter_by(id=numeric_id, project_id=project_id).first()
    if translation and translation.description and translation.description.strip():
        return translation.description.strip()
    
    # Text table
    text = Text.query.filter_by(id=numeric_id, project_id=project_id).first()
    if text and text.description and text.description.strip():
        return text.description.strip()
    
    return ""

def _get_translation_instructions(project_id: int, source_file_id: str, target_file_id: str, project) -> Optional[str]:
    """Get translation instructions including target file purpose"""
    
    instruction_parts = []
    
    target_purpose = _get_file_purpose(project_id, target_file_id)
    
    if target_purpose:
        instruction_parts.append(f"Target context: {target_purpose}")
    
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
        
        # Get verse from database
        verse = ProjectFileVerse.query.filter_by(
            project_file_id=project_file.id,
            verse_index=verse_index
        ).first()
        
        return verse.verse_text if verse else ""
        
    elif file_id.startswith('translation_'):
        translation_id = int(file_id.replace('translation_', ''))
        translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first()
        if not translation:
            return ""
        
        translation_manager = _get_translation_manager(translation)
        return translation_manager.get_verse(verse_index)
    
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
@login_required
def translate():
    try:
        data = request.get_json()
        text_to_translate = data.get('text', '').strip()
        target_language = data.get('target_language', '').strip()
        project_id = data.get('project_id')
        source_file_id = data.get('source_file_id')
        target_file_id = data.get('target_file_id')
        
        # Check if user has edit permission for translation requests
        if project_id:
            require_project_access(project_id, "editor")
        
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

# Legacy translation routes removed - everything now uses unified Text schema

@translation.route('/project/<int:project_id>/texts')
@login_required
def list_all_texts(project_id):
    """List all texts - UNIFIED SCHEMA (dramatically simplified!)"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    texts = []
    
    # NEW: Get unified Text records
    from models import Text
    unified_texts = Text.query.filter_by(project_id=project_id).all()
    
    for text in unified_texts:
        texts.append({
            'id': f'text_{text.id}',  # New unified format
            'name': text.name,
            'type': text.text_type.replace('_', ' ').title(),  # source -> Source, back_translation -> Back Translation  
            'progress': round(text.progress_percentage or 0, 1),
            'created_at': text.created_at.isoformat(),
            'is_unified': True  # Mark as using new system
        })
    
    # LEGACY: Get old format records for backward compatibility during transition
    # Only include if not already migrated to unified format
    existing_names = {t['name'] for t in texts}
    
    # Legacy files
    legacy_files = ProjectFile.query.filter_by(project_id=project_id).all()
    for file in legacy_files:
        if file.original_filename not in existing_names:
            texts.append({
                'id': f'file_{file.id}',
                'name': file.original_filename,
                'type': f'{file.file_type.replace("_", " ").title()} File',
                'progress': 100,  # Files are complete when uploaded
                'created_at': file.created_at.isoformat(),
                'is_unified': False  # Mark as legacy
            })
    
    # Legacy translations
    legacy_translations = Translation.query.filter_by(project_id=project_id).all()
    for trans in legacy_translations:
        if trans.name not in existing_names:
            texts.append({
                'id': f'translation_{trans.id}',
                'name': trans.name,
                'type': 'Translation',
                'progress': round(trans.progress_percentage or 0, 1),
                'created_at': trans.created_at.isoformat(),
                'is_unified': False  # Mark as legacy
            })
    
    # Sort by creation date (newest first)
    texts.sort(key=lambda x: x['created_at'], reverse=True)
    
    return jsonify({'texts': texts})

@translation.route('/project/<int:project_id>/texts/<int:text_id>', methods=['DELETE'])
@login_required
def delete_text(project_id, text_id):
    """Delete a unified Text record (new schema)"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    from models import Text
    text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
    
    # Delete the text and all its verses
    db.session.delete(text)
    db.session.commit()
    
    return '', 204  # No content response

@translation.route('/project/<int:project_id>/texts/<int:text_id>/purpose', methods=['POST'])
@login_required
def update_text_purpose(project_id, text_id):
    """Update the purpose description for a unified Text record"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    from models import Text
    text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
    
    data = request.get_json()
    description = data.get('description', '').strip()
    
    # Validate description length
    if len(description) > 1000:
        return jsonify({'error': 'Purpose description must be 1000 characters or less'}), 400
    
    # Update the text description
    text.description = description if description else None
    
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Updated purpose for {text.name}'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update purpose: {str(e)}'}), 500

@translation.route('/project/<int:project_id>/texts/<int:text_id>/download')
@login_required
def download_text(project_id, text_id):
    """Download a unified Text record"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    from models import Text
    from utils.text_manager import TextManager
    
    text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
    
    try:
        # Create a safe filename
        safe_name = "".join(c for c in text.name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_')
        filename = f"{safe_name}.txt"
        
        # Get text content using TextManager
        text_manager = TextManager(text_id)
        # Get all verses (0-31169) 
        all_indices = list(range(41899))
        verses = text_manager.get_verses(all_indices)
        content = '\n'.join(verses)
        
        return send_file(
            io.BytesIO(content.encode('utf-8')), 
            as_attachment=True, 
            download_name=filename,
            mimetype='text/plain'
        )
        
    except Exception as e:
        return jsonify({'error': f'Text download failed: {str(e)}'}), 500


@translation.route('/project/<int:project_id>/translations', methods=['POST'])
@login_required  
def create_translation(project_id):
    """Create new translation - UNIFIED SCHEMA (simplified!)"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': 'Translation name is required'}), 400
    
    if len(name) > 255:
        return jsonify({'error': 'Translation name too long'}), 400
    
    # Check if name already exists (check both new and legacy formats)
    from models import Text
    existing_unified = Text.query.filter_by(project_id=project_id, name=name).first()
    existing_legacy = Translation.query.filter_by(project_id=project_id, name=name).first()
    
    if existing_unified or existing_legacy:
        return jsonify({'error': 'Translation name already exists'}), 400
    
    try:
        # Create new unified Text record for draft translation
        from utils.text_manager import TextManager
        
        text_id = TextManager.create_text(
            project_id=project_id,
            name=name,
            text_type='draft',  # translations are drafts in the unified schema
            description=f'Translation workspace created by {current_user.name}'
        )
        
        text = Text.query.get(text_id)
        
        return jsonify({
            'success': True,
            'translation': {
                'id': f'text_{text.id}',  # New unified format
                'name': text.name,
                'progress': 0.0,
                'translated_verses': 0,
                'total_verses': text.total_verses,
                'created_at': text.created_at.isoformat(),
                'is_unified': True
            }
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating translation: {e}")
        return jsonify({'error': 'Failed to create translation'}), 500


@translation.route('/project/<int:project_id>/translations/<int:translation_id>/purpose', methods=['POST'])
@login_required
def update_translation_purpose(project_id, translation_id):
    """Update the purpose description for a legacy Translation record"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
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


@translation.route('/project/<int:project_id>/translation/<target_id>/chapter/<book>/<int:chapter>')
@login_required
def get_chapter_verses(project_id, target_id, book, chapter):
    """Get all verses for a specific chapter"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
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
            
            # Get verses from database - all files should use database storage
            verse_indices = [v['index'] for v in chapter_verses]
            verses = ProjectFileVerse.query.filter(
                ProjectFileVerse.project_file_id == target_file.id,
                ProjectFileVerse.verse_index.in_(verse_indices)
            ).all()
            
            # Create a mapping for quick lookup
            verse_map = {v.verse_index: v.verse_text for v in verses}
            target_texts = [verse_map.get(idx, '') for idx in verse_indices]

        elif target_id.startswith('translation_'):
            # Target is a translation
            translation_id = int(target_id.replace('translation_', ''))
            translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
            
            # Get description from translation
            target_purpose = translation.description or ''
            
            translation_manager = _get_translation_manager(translation)
            verse_indices = [v['index'] for v in chapter_verses]
            target_texts = translation_manager.get_chapter_verses(verse_indices)
            
        elif target_id.startswith('text_'):
            # NEW: Target is a unified Text record (new schema)
            text_id = int(target_id.replace('text_', ''))
            from models import Text
            from utils.text_manager import TextManager
            
            target_text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
            target_purpose = target_text.description or ''
            
            text_manager = TextManager(text_id)
            verse_indices = [v['index'] for v in chapter_verses]
            target_texts = text_manager.get_verses(verse_indices)
            
        else:
            # Assume it's a direct translation ID (for backward compatibility)
            try:
                translation_id = int(target_id)
                translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
                
                # Get description from translation
                target_purpose = translation.description or ''
                
                translation_manager = _get_translation_manager(translation)
                verse_indices = [v['index'] for v in chapter_verses]
                target_texts = translation_manager.get_chapter_verses(verse_indices)
            except ValueError:
                return jsonify({'error': 'Invalid target_id format'}), 400
        
        # Get source text - handle both file and translation sources
        source_verses = []
        
        if source_id.startswith('file_'):
            # eBible file source
            file_id = int(source_id.replace('file_', ''))
            source_file = ProjectFile.query.filter_by(
                id=file_id,
                project_id=project_id
            ).first_or_404()
            
            # Get verses from database - all files should use database storage
            verse_indices = [v['index'] for v in chapter_verses]
            verses = ProjectFileVerse.query.filter(
                ProjectFileVerse.project_file_id == source_file.id,
                ProjectFileVerse.verse_index.in_(verse_indices)
            ).all()
            
            # Create a mapping for quick lookup
            verse_map = {v.verse_index: v.verse_text for v in verses}
            source_verses = [verse_map.get(idx, '') for idx in verse_indices]
        
        elif source_id.startswith('translation_'):
            # Translation source
            source_translation_id = int(source_id.replace('translation_', ''))
            source_translation = Translation.query.filter_by(
                id=source_translation_id,
                project_id=project_id
            ).first_or_404()
            
            source_manager = _get_translation_manager(source_translation)
            verse_indices = [v['index'] for v in chapter_verses]
            source_verses = source_manager.get_chapter_verses(verse_indices)
        
        elif source_id.startswith('text_'):
            # NEW: Source is a unified Text record (new schema)
            text_id = int(source_id.replace('text_', ''))
            from models import Text
            from utils.text_manager import TextManager
            
            source_text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
            
            text_manager = TextManager(text_id)
            verse_indices = [v['index'] for v in chapter_verses]
            source_verses = text_manager.get_verses(verse_indices)
        
        else:
            return jsonify({'error': 'Invalid source_id format'}), 400
        
        # Build response
        verses_data = []
        for i, verse_info in enumerate(chapter_verses):
            source_text = source_verses[i] if i < len(source_verses) else ''
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
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Verse text is required'}), 400
    
    verse_text = data['text']
    
    # Strip newlines to maintain line alignment for context queries
    verse_text = ' '.join(verse_text.split())
    
    try:
        if target_id.startswith('file_'):
            # Target is a file - use database storage
            file_id = int(target_id.replace('file_', ''))
            target_file = ProjectFile.query.filter_by(
                id=file_id,
                project_id=project_id
            ).first_or_404()
            
            # Update or create verse in database
            existing_verse = ProjectFileVerse.query.filter_by(
                project_file_id=target_file.id,
                verse_index=verse_index
            ).first()
            
            if existing_verse:
                existing_verse.verse_text = verse_text
            else:
                new_verse = ProjectFileVerse(
                    project_file_id=target_file.id,
                    verse_index=verse_index,
                    verse_text=verse_text
                )
                db.session.add(new_verse)
            
            db.session.commit()
            
        elif target_id.startswith('translation_'):
            # Target is a translation
            translation_id = int(target_id.replace('translation_', ''))
            translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
            
            translation_manager = _get_translation_manager(translation)
            translation_manager.save_verse(verse_index, verse_text)
            
            # Update progress
            translation.updated_at = datetime.utcnow()
            db.session.commit()
            
        elif target_id.startswith('text_'):
            # NEW: Target is a unified Text record (new schema)
            text_id = int(target_id.replace('text_', ''))
            from models import Text
            from utils.text_manager import TextManager
            
            target_text = Text.query.filter_by(id=text_id, project_id=project_id).first_or_404()
            
            text_manager = TextManager(text_id)
            success = text_manager.save_verse(verse_index, verse_text)
            
            if not success:
                return jsonify({'error': 'Failed to save verse'}), 500
            
        else:
            # Assume it's a direct translation ID (for backward compatibility)
            try:
                translation_id = int(target_id)
                translation = Translation.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
                
                translation_manager = _get_translation_manager(translation)
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






 