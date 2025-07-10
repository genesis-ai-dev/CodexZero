import os
import asyncio
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ai.bot import Chatbot

api = Blueprint('api', __name__)


@api.route('/api/translate', methods=['POST'])
@login_required
def translate_passage():
    """Translate a Bible passage using AI"""
    try:
        data = request.get_json()
        
        # Get form data
        passage_key = data.get('passage')
        target_language = data.get('target_language', '')
        audience = data.get('audience', '')
        style = data.get('style', '')
        model = data.get('model')  # Optional model override
        
        # Bible passages mapping
        passages = {
            'john3:16': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
            'genesis1:1': 'In the beginning God created the heavens and the earth.',
            'psalm23:1': 'The Lord is my shepherd, I lack nothing.',
            'matthew28:19': 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.',
            'romans3:23': 'For all have sinned and fall short of the glory of God.',
            'revelation21:4': 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.'
        }
        
        original_text = passages.get(passage_key)
        
        # Create chatbot instance
        chatbot = Chatbot()
        
        # Translate using AI
        def run_translation():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(
                    chatbot.translate_text(
                        text=original_text,
                        target_language=target_language,
                        audience=audience,
                        style=style,
                        context=f"Bible verse ({passage_key})",
                        model=model
                    )
                )
            finally:
                loop.close()
        
        translation = run_translation()
        
        return jsonify({
            'success': True,
            'translation': translation,
            'passage': passage_key,
            'original': original_text
        })
        
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@api.route('/api/corpus/files')
@login_required
def list_corpus_files():
    """List available corpus files for import"""
    corpus_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Corpus')
    
    if not os.path.exists(corpus_dir):
        return jsonify({'files': []})
    
    corpus_files = []
    for filename in os.listdir(corpus_dir):
        if filename.lower().endswith('.txt'):
            file_path = os.path.join(corpus_dir, filename)
            try:
                file_size = os.path.getsize(file_path)
                with open(file_path, 'r', encoding='utf-8') as f:
                    line_count = sum(1 for line in f)
                
                # Extract language/translation info from filename
                name_parts = filename.replace('.txt', '').split('_')
                display_name = ' '.join([part.title() for part in name_parts])
                
                corpus_files.append({
                    'filename': filename,
                    'display_name': display_name,
                    'file_size': file_size,
                    'line_count': line_count
                })
            except Exception as e:
                print(f"Error reading corpus file {filename}: {e}")
                continue
    
    return jsonify({'files': corpus_files})


@api.route('/project/<int:project_id>/import-corpus', methods=['POST'])
@login_required
def import_corpus_file(project_id):
    """Import a corpus file into the project"""
    from models import db, Project
    from utils.project_access import require_project_access
    from utils.file_helpers import save_project_file
    
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    data = request.get_json()
    corpus_filename = data.get('filename')
    
    if not corpus_filename:
        return jsonify({'error': 'No filename provided'}), 400
    
    corpus_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Corpus')
    corpus_file_path = os.path.join(corpus_dir, corpus_filename)
    
    if not os.path.exists(corpus_file_path):
        return jsonify({'error': 'Corpus file not found'}), 404
    
    if not corpus_filename.lower().endswith('.txt'):
        return jsonify({'error': 'Only .txt files are supported'}), 400
    
    try:
        # Read the corpus file content
        with open(corpus_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Generate a unique filename for the project
        from datetime import datetime
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        base_name = corpus_filename.replace('.txt', '')
        project_filename = f"{base_name}_imported_{timestamp}.txt"
        
        # Save as project file
        project_file = save_project_file(
            project_id,
            file_content,
            project_filename,
            'ebible',  # Corpus files are eBible format
            'text/plain'
        )
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Corpus file "{corpus_filename}" imported successfully',
            'file_id': project_file.id,
            'project_filename': project_filename
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 500 