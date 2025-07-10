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

from models import Project, Text, Verse, db
from ai.bot import Chatbot, extract_translation_from_xml
from ai.contextquery import DatabaseContextQuery
from utils.text_manager import TextManager
from utils.translation_manager import VerseReferenceManager
from utils.project_access import require_project_access

translation = Blueprint('translation', __name__)

def _parse_source_filenames(job):
    """Parse source filenames from job with proper error handling"""
    try:
        source_filename = job.source_file.original_filename if job.source_file else "Unknown Source"
        target_filename = job.target_file.original_filename if job.target_file else "Unknown Target"
        return source_filename, target_filename
    except Exception as e:
        print(f"Error parsing filenames: {e}")
        return "Unknown Source", "Unknown Target"

@translation.route('/project/<int:project_id>/translate')
@login_required
def translate_page(project_id):
    require_project_access(project_id, "viewer")  # Allow viewers to see the page
    project = Project.query.get_or_404(project_id)
    
    # Load book chapters data
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
    """Get examples using source and target texts with context query"""
    if not query_text:
        return [], "No query text provided"
    
    source_id = int(source_text_id.replace('text_', ''))
    target_id = int(target_text_id.replace('text_', ''))
    
    # Get non-empty verses from both texts
    source_verses = Verse.query.filter(
        Verse.text_id == source_id,
        Verse.verse_text != ''
    ).all()
    source_data = [(v.verse_index, v.verse_text) for v in source_verses]
    
    target_verses = Verse.query.filter(
        Verse.text_id == target_id,
        Verse.verse_text != ''
    ).all()
    target_data = [(v.verse_index, v.verse_text) for v in target_verses]
    
    if not source_data or not target_data:
        return [], "No content found in source or target texts"
    
    # Use DatabaseContextQuery for efficient similarity search
    try:
        cq = DatabaseContextQuery(source_data, target_data)
        results = cq.search_by_text(query_text, top_k=10, min_examples=3, coverage_threshold=0.9, exclude_idx=exclude_verse_index)
        
        examples = [target_text.strip() for _, _, target_text, _ in results]
        return examples, f"Found {len(examples)} examples"
        
    except Exception as e:
        return [], f"Error in context query: {str(e)}"

def translate_text(project_id: int, text: str, model: str = None, temperature: float = 0.2, 
                  source_text_id: str = None, target_text_id: str = None) -> Dict[str, Any]:
    """Translate text using AI model with examples from project texts"""
    
    project = Project.query.get(project_id)
    if not project:
        return {'error': 'Project not found'}
    
    # Get examples if text IDs provided
    examples = []
    if source_text_id and target_text_id:
        examples, _ = _get_translation_examples(project_id, source_text_id, target_text_id, text)
    
    # Get project instructions
    instructions = f"Translate to {project.target_language} for {project.audience} in {project.style} style."
    if project.instructions:
        instructions += f" Additional instructions: {project.instructions}"
    
    # Use selected model or project default
    model = model or project.get_current_translation_model()
    
    try:
        chatbot = Chatbot(model=model, temperature=temperature)
        
        if examples:
            prompt = f"""Translate this text to {project.target_language}:

{text}

{instructions}

Here are some examples from similar contexts:
{chr(10).join(f'- {ex}' for ex in examples[:5])}

Provide only the translation, no explanations."""
        else:
            prompt = f"""Translate this text to {project.target_language}:

{text}

{instructions}

Provide only the translation, no explanations."""
        
        response = chatbot.chat(prompt)
        
        return {
            'translation': response.strip(),
            'model': model,
            'examples_used': len(examples)
        }
        
    except Exception as e:
        return {'error': f'Translation error: {str(e)}'}

@translation.route('/translate', methods=['POST'])
@login_required
def translate():
    try:
        data = request.get_json()
        text_to_translate = data.get('text', '').strip()
        target_language = data.get('target_language', '').strip()
        project_id = data.get('project_id')
        source_text_id = data.get('source_file_id')  # Legacy name, now text_id
        target_text_id = data.get('target_file_id')  # Legacy name, now text_id
        
        # Check if user has edit permission for translation requests
        if project_id:
            require_project_access(project_id, "editor")
        
        temperature = data.get('temperature', 0.2)
        use_examples = data.get('use_examples', True)
        
        if not text_to_translate or not target_language or not project_id:
            return jsonify({'success': False, 'error': 'Missing required parameters'})
        
        try:
            temperature = float(temperature)
            if not (0.0 <= temperature <= 2.0):
                temperature = 0.2
        except (ValueError, TypeError):
            temperature = 0.2
        
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'})
        
        # Get examples if requested
        examples = []
        if use_examples and source_text_id and target_text_id:
            examples, _ = _get_translation_examples(project_id, source_text_id, target_text_id, text_to_translate)
        
        # Translate
        result = translate_text(project_id, text_to_translate, temperature=temperature, 
                              source_text_id=source_text_id if use_examples else None,
                              target_text_id=target_text_id if use_examples else None)
        
        if 'error' in result:
            return jsonify({'success': False, 'error': result['error']})
        
        return jsonify({
            'success': True,
            'translation': result['translation'],
            'model': result['model'],
            'examples_count': result.get('examples_used', 0),
            'temperature': temperature
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Translation failed: {str(e)}'})

@translation.route('/project/<int:project_id>/texts')
@login_required
def list_all_texts(project_id):
    """List all available texts (unified endpoint)"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    texts = []
    all_texts = Text.query.filter_by(project_id=project_id).all()
    
    for text in all_texts:
        texts.append({
            'id': f"text_{text.id}",
            'name': text.name,
            'type': text.text_type.title(),
            'progress': text.progress_percentage,
            'created_at': text.created_at.isoformat()
        })
    
    return jsonify({'texts': texts})

@translation.route('/project/<int:project_id>/translations', methods=['POST'])
@login_required  
def create_translation(project_id):
    """Create a new translation"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': 'Translation name is required'}), 400
    
    # Create new text
    text_id = TextManager.create_text(project_id, name, 'draft')
    
    return jsonify({
        'success': True,
        'translation_id': text_id,
        'message': f'Translation "{name}" created successfully'
    })

@translation.route('/project/<int:project_id>/translation/<target_id>/chapter/<book>/<int:chapter>')
@login_required
def get_chapter_verses(project_id, target_id, book, chapter):
    """Get verses for a specific chapter"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    
    text_id = int(target_id.replace('text_', ''))
    
    # Get verse reference manager
    verse_ref_manager = VerseReferenceManager()
    verse_indices = verse_ref_manager.get_chapter_verse_indices(book, chapter)
    
    # Get verses from database
    verses = TextManager.get_verses(text_id, verse_indices)
    
    # Format response
    response_verses = []
    for i, verse_text in enumerate(verses):
        verse_number = i + 1
        response_verses.append({
            'verse': verse_number,
            'text': verse_text,
            'verse_index': verse_indices[i]
        })
    
    return jsonify({
        'verses': response_verses,
        'book': book,
        'chapter': chapter
    })

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
    verse_text = ' '.join(verse_text.split())  # Clean whitespace
    
    text_id = int(target_id.replace('text_', ''))
    
    # Save verse
    success = TextManager.save_verse(text_id, verse_index, verse_text)
    
    if success:
        return jsonify({'success': True, 'message': 'Verse saved successfully'})
    else:
        return jsonify({'error': 'Failed to save verse'}), 500

@translation.route('/project/<int:project_id>/translations/<int:translation_id>/download')
@login_required
def download_translation(project_id, translation_id):
    """Download translation as text file"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    text = Text.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
    
    # Get all verses
    verses = TextManager.get_all_verses(translation_id)
    content = '\n'.join(verses)
    
    # Create file
    file_obj = io.BytesIO(content.encode('utf-8'))
    file_obj.seek(0)
    
    filename = f"{text.name.replace(' ', '_')}.txt"
    
    return send_file(
        file_obj,
        as_attachment=True,
        download_name=filename,
        mimetype='text/plain'
    )

@translation.route('/project/<int:project_id>/translations/<int:translation_id>', methods=['DELETE'])
@login_required
def delete_translation(project_id, translation_id):
    """Delete a translation"""
    require_project_access(project_id, "editor")
    project = Project.query.get_or_404(project_id)
    text = Text.query.filter_by(id=translation_id, project_id=project_id).first_or_404()
    
    db.session.delete(text)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Translation deleted successfully'}) 