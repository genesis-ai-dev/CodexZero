from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from utils.project_access import require_project_access
from utils.language_server import LanguageServerService

language_server = Blueprint('language_server', __name__)


@language_server.route('/project/<int:project_id>/language-server/analyze/<text_id>/<int:verse_index>', methods=['GET', 'POST'])
@login_required
def analyze_verse(project_id, text_id, verse_index):
    """Analyze a specific verse and return language suggestions"""
    require_project_access(project_id, "viewer")
    
    try:
        verse_text = None
        
        # Check if text is provided in POST request (for current unsaved text)
        if request.method == 'POST':
            data = request.get_json()
            verse_text = data.get('text', '').strip() if data else None
        
        # If no text provided, get from database
        if not verse_text:
            from models import Verse
            verse = Verse.query.filter_by(
                text_id=int(text_id.replace('text_', '')),
                verse_index=verse_index
            ).first()
            
            if not verse:
                return jsonify({
                    'success': True,
                    'analysis': {'suggestions': []},
                    'statistics': {
                        'total_suggestions': 0
                    }
                })
            
            verse_text = verse.verse_text
        
        # Run analysis
        ls = LanguageServerService(project_id)
        analysis = ls.analyze_verse(verse_text)
        
        # Calculate statistics
        stats = {
            'total_suggestions': len(analysis.get('suggestions', []))
        }
        
        return jsonify({
            'success': True,
            'analysis': analysis,
            'statistics': stats
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@language_server.route('/project/<int:project_id>/language-server/action', methods=['POST'])
@login_required
def execute_action(project_id):
    """Execute a suggestion action (add_to_dictionary, ignore, etc.)"""
    require_project_access(project_id, "editor")
    
    try:
        data = request.get_json()
        action = data.get('action', '').strip()
        substring = data.get('substring', '').strip()
        text_id = data.get('text_id', '')
        verse_index = data.get('verse_index')
        
        if not action or not substring:
            return jsonify({
                'success': False,
                'error': 'Action and substring are required'
            }), 400
        
        ls = LanguageServerService(project_id)
        
        if action == 'add_to_dictionary':
            ls.add_word_to_dictionary(substring, current_user.id)
            
            # Re-analyze the verse to get updated suggestions
            updated_analysis = None
            if text_id and verse_index is not None:
                from models import Verse
                verse = Verse.query.filter_by(
                    text_id=int(text_id.replace('text_', '')),
                    verse_index=verse_index
                ).first()
                
                if verse:
                    updated_analysis = ls.analyze_verse(verse.verse_text)
            
            return jsonify({
                'success': True,
                'message': f'Added "{substring}" to dictionary',
                'updated_analysis': updated_analysis
            })
        
        elif action == 'ignore':
            # For now, just return success - ignore functionality could be implemented later
            return jsonify({
                'success': True,
                'message': f'Ignored suggestion for "{substring}"'
            })
        

        else:
            return jsonify({
                'success': False,
                'error': f'Unknown action: {action}'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@language_server.route('/project/<int:project_id>/language-server/dictionary', methods=['POST'])
@login_required
def add_to_dictionary(project_id):
    """Add word to project dictionary"""
    require_project_access(project_id, "editor")
    
    data = request.get_json()
    word = data.get('word', '').strip()
    
    if word:
        ls = LanguageServerService(project_id)
        was_added = ls.add_word_to_dictionary(word, current_user.id)
        return jsonify({'success': True, 'added': was_added})
        
    return jsonify({'success': True, 'added': False})


@language_server.route('/project/<int:project_id>/language-server/dictionary/bulk', methods=['POST'])
@login_required
def add_bulk_to_dictionary(project_id):
    """Add multiple words to project dictionary"""
    require_project_access(project_id, "editor")
    
    data = request.get_json()
    words = data.get('words', [])
    
    if not words or not isinstance(words, list):
        return jsonify({
            'success': False,
            'error': 'Words array is required'
        }), 400
    
    ls = LanguageServerService(project_id)
    
    try:
        added_count = ls.add_words_to_dictionary_bulk(words, current_user.id)
    except Exception as e:
        print(f"Error adding words in bulk: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to add words to dictionary'
        }), 500
    
    return jsonify({
        'success': True,
        'added_count': added_count,
        'total_words': len(words)
    })


@language_server.route('/project/<int:project_id>/language-server/suggestions/<word>', methods=['GET'])
@login_required
def get_word_suggestions(project_id, word):
    """Get spelling suggestions for a specific word"""
    require_project_access(project_id, "viewer")
    
    try:
        ls = LanguageServerService(project_id)
        suggestions = ls.get_word_suggestions(word)
        
        return jsonify({
            'success': True,
            'word': word,
            'suggestions': suggestions
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


 