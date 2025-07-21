from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required
from models import db, Text, Verse
from utils.project_access import require_project_access
from utils.translation_manager import VerseReferenceManager
from utils.text_manager import TextManager
import io

export_bp = Blueprint('export', __name__)

@export_bp.route('/project/<int:project_id>/export/<text_id>/usfm', methods=['GET'])
@login_required
def export_usfm(project_id, text_id):
    """Export a text as a USFM file."""
    require_project_access(project_id, "viewer")

    try:
        if text_id.startswith('text_'):
            text_id_int = int(text_id.replace('text_', ''))
        else:
            text_id_int = int(text_id)

        text = Text.query.filter_by(id=text_id_int, project_id=project_id).first_or_404()
        
        verse_ref_manager = VerseReferenceManager()
        
        book_param = request.args.get('book')
        chapter_param = request.args.get('chapter')

        verses = []

        if book_param and chapter_param:
            chapter_param_int = int(chapter_param)
            chapter_verses_info = verse_ref_manager.get_chapter_verses(book_param, chapter_param_int)
            if not chapter_verses_info:
                return jsonify({"error": f"No verses found for {book_param} chapter {chapter_param}"}), 404
            
            verse_indices = [info['index'] for info in chapter_verses_info]
            
            verses = Verse.query.filter(
                Verse.text_id == text_id_int,
                Verse.verse_index.in_(verse_indices)
            ).order_by(Verse.verse_index).all()
        else:
            # Fetch all verses for the text if no chapter is specified
            verses = Verse.query.filter_by(text_id=text_id_int).order_by(Verse.verse_index).all()

        if not verses:
            return jsonify({"error": "No verses found for this text"}), 404

        usfm_content = []
        current_book = None
        current_chapter = None

        for verse in verses:
            if not verse.verse_text or not verse.verse_text.strip():
                continue

            verse_ref_str = verse_ref_manager.get_verse_reference(verse.verse_index)
            if not verse_ref_str:
                continue

            parsed_ref = verse_ref_manager.parse_verse_ref(verse_ref_str)
            if not parsed_ref:
                continue
            
            book, chapter, verse_num = parsed_ref

            if book != current_book:
                usfm_content.append(f"\\id {book}")
                current_book = book
                current_chapter = None
            
            if chapter != current_chapter:
                usfm_content.append(f"\\c {chapter}")
                current_chapter = chapter
            
            usfm_content.append(f"\\v {verse_num} {verse.verse_text.strip()}")

        if not usfm_content:
             return jsonify({"error": "No content to export"}), 404

        usfm_string = "\n".join(usfm_content)
        
        download_filename = f'{text.name}.usfm'
        if book_param and chapter_param:
            download_filename = f'{text.name}_{book_param}_{chapter_param}.usfm'

        return send_file(
            io.BytesIO(usfm_string.encode('utf-8')),
            mimetype='application/x-usfm',
            as_attachment=True,
            download_name=download_filename
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500 