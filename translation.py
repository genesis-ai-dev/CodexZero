import os
import json
import tempfile
import random
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from thefuzz import fuzz

from models import BackTranslationJob, Project
from ai.bot import Chatbot
from ai.contextquery import ContextQuery

translation = Blueprint('translation', __name__)

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
    
    back_translation_jobs = BackTranslationJob.query.filter_by(
        project_id=project_id, status='completed'
    ).all()
    
    back_translation_jobs_data = [{
        'id': job.id,
        'source_filename': job.source_filename,
        'total_lines': job.total_lines
    } for job in back_translation_jobs]
    
    return render_template('translate.html', 
                         project=project,
                         back_translation_jobs=back_translation_jobs_data,
                         linguistic_analysis_jobs=[])


def _get_back_translation_examples(project_id, job_id, query_text):
    job = BackTranslationJob.query.filter_by(
        id=job_id, project_id=project_id, status='completed'
    ).first()
    
    if not job:
        return [], "Back translation job not found"
    
    try:
        # Load results from new storage format first, fallback to old format
        if job.results_storage_path:
            from storage import get_storage
            storage = get_storage()
            results_content = storage.get_file(job.results_storage_path).decode('utf-8')
            back_translations = json.loads(results_content)
        elif job.back_translations:
            back_translations = json.loads(job.back_translations)
        else:
            return [], f"No back translation data in {job.source_filename}"
    except (json.JSONDecodeError, TypeError) as e:
        print(f"Failed to parse back translations: {e}")
        return [], f"Invalid data in {job.source_filename}"
    
    source_lines = []
    target_lines = []
    
    for result in back_translations:
        back_translation = result.get('back_translation', '')
        if not back_translation.startswith('[ERROR:'):
            # Clean newlines from back translations to ensure one line per translation
            clean_back_translation = ' '.join(back_translation.split())
            source_lines.append(clean_back_translation)
            target_lines.append(result.get('original', ''))
    
    if not source_lines:
        return [], f"No valid examples in {job.source_filename}"
    
    examples = []
    try:
        # Create temporary files for ContextQuery
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as source_file:
            source_file.write('\n'.join(source_lines))
            source_path = source_file.name
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as target_file:
            target_file.write('\n'.join(target_lines))
            target_path = target_file.name
        
        try:
            # Initialize ContextQuery and find examples
            cq = ContextQuery(source_path, target_path)
            results = cq.search_by_text(query_text, top_k=15)
            
            # Format examples for the AI
            for verse_id, source_text, target_text, coverage in results:
                examples.append(f"English: {source_text.strip()}\n{target_text.strip()}")
            
        finally:
            # Clean up temporary files
            for path in [source_path, target_path]:
                if os.path.exists(path):
                    os.unlink(path)
    
    except Exception as e:
        print(f"Example search failed: {e}")
    
    return examples, f"Back translation from {job.source_filename}"

@translation.route('/project/<int:project_id>/test')
@login_required
def test_page(project_id):
    """Render the translation testing page."""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    back_translation_jobs = BackTranslationJob.query.filter_by(
        project_id=project_id, status='completed'
    ).all()
    
    back_translation_jobs_data = [{
        'id': job.id,
        'source_filename': job.source_filename,
        'total_lines': job.total_lines
    } for job in back_translation_jobs]
    
    return render_template('test_translation.html', 
                         project=project,
                         back_translation_jobs=back_translation_jobs_data)

@translation.route('/project/<int:project_id>/test/run', methods=['POST'])
@login_required
def run_translation_test(project_id):
    """Run a translation test using the same logic as the main translate endpoint."""
    try:
        data = request.get_json()
        job_id = data.get('job_id')
        num_lines = data.get('num_lines', 1)  # Default to 1 for backward compatibility
        example_counts = data.get('example_counts', [0, 5, 15])  # Default to original counts
        
        # Validate num_lines
        if not isinstance(num_lines, int) or num_lines < 1 or num_lines > 50:
            return jsonify({'success': False, 'error': 'Number of lines must be between 1 and 50.'})
        
        # Validate example_counts
        if not isinstance(example_counts, list) or len(example_counts) == 0 or len(example_counts) > 10:
            return jsonify({'success': False, 'error': 'Example counts must be a list of 1-10 values.'})
        
        for count in example_counts:
            if not isinstance(count, int) or count < 0 or count > 25:
                return jsonify({'success': False, 'error': 'Each example count must be between 0 and 25.'})
        
        # Remove duplicates and sort
        example_counts = sorted(list(set(example_counts)))
        
        # Get the project to extract target language
        project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
        target_language = project.target_language
        
        job = BackTranslationJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()

        if job.status != 'completed':
            return jsonify({'success': False, 'error': 'Selected file is not ready for testing.'})

        # Load all lines from the job
        if job.results_storage_path:
            from storage import get_storage
            storage = get_storage()
            results_content = storage.get_file(job.results_storage_path).decode('utf-8')
            all_lines = json.loads(results_content)
        elif job.back_translations:
            all_lines = json.loads(job.back_translations)
        else:
            return jsonify({'success': False, 'error': 'No translation data found.'})

        if not all_lines:
            return jsonify({'success': False, 'error': 'The selected file is empty.'})

        # Validate we have enough lines
        valid_lines = [line for line in all_lines 
                      if line.get('back_translation') and line.get('original') 
                      and not line.get('back_translation', '').startswith('[ERROR:')]
        
        if len(valid_lines) < num_lines:
            return jsonify({'success': False, 'error': f'Only {len(valid_lines)} valid lines available, but {num_lines} requested.'})
        
        # For multiple lines, we'll collect all individual results and then calculate averages
        all_line_results = []
        line_details = []
        
        # Sample random lines without replacement
        selected_lines = random.sample(valid_lines, num_lines)
        
        for line_idx, ground_truth_line in enumerate(selected_lines):
            text_to_translate = ground_truth_line.get('back_translation', '')
            ground_truth_translation = ground_truth_line.get('original', '')
            
            line_results = []
            
            for count in example_counts:
                if count == 0:
                    examples = []
                else:
                    # Get examples using the existing function, excluding the ground truth
                    examples, _ = _get_back_translation_examples(project_id, job_id, text_to_translate)
                    # Remove any example that matches our ground truth
                    examples = [ex for ex in examples if ground_truth_translation not in ex]
                    # Take only the requested number
                    examples = examples[:count]

                # Use the same translation logic as the main translate endpoint
                ai_translation = _generate_translation_with_examples(
                    text_to_translate,
                    target_language,
                    examples,
                    []
                )
                
                # Calculate accuracy score
                accuracy = fuzz.ratio(ai_translation.lower(), ground_truth_translation.lower())

                line_results.append({
                    'example_count': count,
                    'translation': ai_translation,
                    'accuracy': accuracy
                })
            
            all_line_results.append(line_results)
            line_details.append({
                'line_number': line_idx + 1,
                'input_text': text_to_translate,
                'ground_truth': ground_truth_translation,
                'results': line_results
            })
        
        # Calculate average results across all lines
        average_results = []
        for count_idx, count in enumerate(example_counts):
            accuracies = [line_results[count_idx]['accuracy'] for line_results in all_line_results]
            average_accuracy = sum(accuracies) / len(accuracies)
            
            average_results.append({
                'example_count': count,
                'average_accuracy': round(average_accuracy, 1),
                'min_accuracy': min(accuracies),
                'max_accuracy': max(accuracies),
                'individual_accuracies': accuracies
            })
        
        response_data = {
            'success': True,
            'num_lines_tested': num_lines,
            'average_results': average_results,
            'line_details': line_details if num_lines <= 5 else [],  # Only include details for small tests
        }
        
        # For single line tests, maintain backward compatibility
        if num_lines == 1:
            response_data.update({
                'results': line_details[0]['results'],
                'ground_truth': line_details[0]['ground_truth'],
                'input_text': line_details[0]['input_text']
            })
        
        return jsonify(response_data)

    except Exception as e:
        print(f"Error during translation test: {e}")
        return jsonify({'success': False, 'error': str(e)})

@translation.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        text_to_translate = data.get('text', '').strip()
        target_language = data.get('target_language', '').strip()
        example_sources = data.get('example_sources', [])
        
        if not text_to_translate:
            return jsonify({'success': False, 'error': 'No text provided'})
        
        if not target_language:
            return jsonify({'success': False, 'error': 'No target language provided'})
        
        if not example_sources:
            return jsonify({'success': False, 'error': 'No example sources selected'})
        
        # Collect examples from all selected sources
        all_examples = []
        source_descriptions = []
        project_instructions = None
        
        for source in example_sources:
            if source == 'instructions':
                # Get project from the first back translation job or find another way to get project
                # For now, we need to get the project ID somehow
                # Let's add it to the request data
                continue  # Handle below
            else:
                source_type, source_id = source.split(':', 1)
                source_id = int(source_id)
                
                if source_type == 'back_translation':
                    job = BackTranslationJob.query.get(source_id)
                    if job:
                        examples, source_info = _get_back_translation_examples(job.project_id, job.id, text_to_translate)
                        all_examples.extend(examples)
                        source_descriptions.append(f"Back Translation: {job.source_filename}")
        
        # Check if instructions are selected and get project
        if 'instructions' in example_sources:
            # We need project_id from somewhere - let's get it from request
            project_id = data.get('project_id')
            if project_id:
                project = Project.query.get(project_id)
                if project and project.instructions:
                    project_instructions = project.instructions
                    source_descriptions.append("Translation Instructions")
        
        # Generate translation using combined examples and instructions
        translation = _generate_translation_with_examples_and_instructions(
            text_to_translate, 
            target_language, 
            all_examples,
            project_instructions,
            source_descriptions
        )
        
        # Calculate confidence metrics for the translation
        confidence_data = _calculate_translation_confidence(translation, all_examples)
        

        return jsonify({
            'success': True,
            'translation': translation,
            'examples_used': len(all_examples),
            'sources': source_descriptions,
            'confidence': confidence_data
        })
        
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)})

def _calculate_translation_confidence(translation, examples):
    """Calculate confidence metrics by finding fuzzy matching substrings in examples"""
    if not examples or not translation:
        return {'segments': [], 'overall_confidence': 0}
    
    # Extract target text from examples (everything after the newline)
    target_texts_with_source = []
    for example in examples:
        if '\n' in example:
            parts = example.split('\n', 1)
            english_part = parts[0].replace('English: ', '').strip()
            target_part = parts[1].strip()
            target_texts_with_source.append({
                'text': target_part.lower(),
                'original': target_part,
                'english': english_part
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

def _generate_translation_with_examples_and_instructions(text, target_language, examples, instructions, source_descriptions):
    """Generates a translation using the AI, including examples and/or instructions."""
    context_parts = []
    
    # Add instructions if provided
    if instructions:
        context_parts.append("TRANSLATION INSTRUCTIONS:")
        context_parts.append(instructions)
        context_parts.append("")
    
    # Add back translation examples if available
    back_translation_examples = [ex for ex in examples if isinstance(ex, str) and '\n' in ex and 'English:' in ex]
    if back_translation_examples:
        context_parts.append("TRANSLATION EXAMPLES:")
        context_parts.extend(back_translation_examples)
        context_parts.append("")
    
    context = '\n'.join(context_parts)
    
    system_prompt = "You are a professional translator with expertise in biblical and religious texts. Provide accurate, natural translations that maintain the meaning and tone of the original text."
    
    if instructions and not back_translation_examples:
        # Instructions-only translation
        user_prompt = f"""Translate the following text to {target_language}.

{context}

INSTRUCTIONS:
- Follow the translation instructions above carefully
- Maintain the same tone and style as specified
- Be accurate and natural in the target language
- Provide only the translation, no explanations

TEXT TO TRANSLATE:
{text}

TRANSLATION:"""
    else:
        # Examples-based or mixed translation
        user_prompt = f"""Translate the following text to {target_language}.

{context}

INSTRUCTIONS:
- Use the translation examples above to understand style, terminology, and context
- Follow any provided translation instructions
- Maintain the same tone and style as the examples
- Be accurate and natural in the target language
- Provide only the translation, no explanations

TEXT TO TRANSLATE:
{text}

TRANSLATION:"""

    chatbot = Chatbot()
    response = chatbot.chat_sync(user_prompt, system_prompt)
    return response.strip()

def _generate_translation_with_examples(text, target_language, examples, source_descriptions):
    """Generates a translation using the AI, including examples."""
    return _generate_translation_with_examples_and_instructions(text, target_language, examples, None, source_descriptions) 