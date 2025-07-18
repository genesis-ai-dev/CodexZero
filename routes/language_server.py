from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from utils.project_access import require_project_access
from utils.language_server import LanguageServerService

language_server = Blueprint('language_server', __name__)


@language_server.route('/project/<int:project_id>/language-server/analyze/<text_id>/<int:verse_index>', methods=['GET'])
@login_required
def analyze_verse(project_id, text_id, verse_index):
    """Analyze a specific verse and return language issues"""
    require_project_access(project_id, "viewer")
    
    try:
        # Get the verse text from the database
        from models import Verse
        verse = Verse.query.filter_by(
            text_id=int(text_id.replace('text_', '')),
            verse_index=verse_index
        ).first()
        
        if not verse:
            return jsonify({
                'success': True,
                'analysis': {'substrings': []},
                'statistics': {
                    'total_issues': 0,
                    'spelling_issues': 0,
                    'capitalization_issues': 0,
                    'punctuation_issues': 0,
                    'style_issues': 0
                }
            })
        
        # Run analysis
        ls = LanguageServerService(project_id)
        analysis = ls.analyze_verse(verse.verse_text)
        
        # Calculate statistics
        stats = {
            'total_issues': len(analysis.get('substrings', [])),
            'spelling_issues': sum(1 for item in analysis.get('substrings', []) if item.get('type') == 'spelling'),
            'capitalization_issues': sum(1 for item in analysis.get('substrings', []) if item.get('type') == 'capitalization'),
            'punctuation_issues': sum(1 for item in analysis.get('substrings', []) if item.get('type') == 'punctuation'),
            'style_issues': sum(1 for item in analysis.get('substrings', []) if item.get('type') == 'style')
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


@language_server.route('/project/<int:project_id>/language-server/dictionary', methods=['POST'])
@login_required
def add_to_dictionary(project_id):
    """Add word to project dictionary"""
    require_project_access(project_id, "editor")
    
    data = request.get_json()
    word = data.get('word', '').strip()
    
    if word:
        ls = LanguageServerService(project_id)
        ls.add_word_to_dictionary(word, current_user.id)
        
    return jsonify({'success': True})


 