import io
import uuid
from flask import Blueprint, request, jsonify, send_file, redirect
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import openai
import os

from models import Project, VerseAudio, db
from storage import get_storage

audio = Blueprint('audio', __name__)


@audio.route('/project/<int:project_id>/verse-audio/<text_id>/<int:verse_index>/tts', methods=['POST'])
@login_required 
def generate_tts(project_id, text_id, verse_index):
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    text = data.get('text', '').strip()
    voice = data.get('voice', 'onyx')
    instructions = data.get('instructions', '').strip()
    
    client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    
    # Build the speech request parameters
    speech_params = {
        "model": "gpt-4o-mini-tts",
        "voice": voice,
        "input": text
    }
    
    # Add instructions if provided (only works with gpt-4o-mini-tts)
    if instructions:
        speech_params["instructions"] = instructions
    
    response = client.audio.speech.create(**speech_params)
    
    audio_data = io.BytesIO(response.content)
    storage = get_storage()
    storage_path = f"audio/{project_id}/{text_id}/{verse_index}_{uuid.uuid4()}_tts.mp3"
    storage.store_file(audio_data, storage_path)
    
    # Replace existing audio
    existing = VerseAudio.query.filter_by(project_id=project_id, text_id=text_id, verse_index=verse_index).first()
    if existing:
        storage.delete_file(existing.storage_path)
        existing.storage_path = storage_path
        existing.file_size = len(response.content)
        audio_id = existing.id
    else:
        audio_record = VerseAudio(
            project_id=project_id, text_id=text_id, verse_index=verse_index,
            storage_path=storage_path, original_filename="tts.mp3",
            file_size=len(response.content), content_type='audio/mpeg'
        )
        db.session.add(audio_record)
        db.session.flush()
        audio_id = audio_record.id
    
    db.session.commit()
    return jsonify({'success': True, 'audio_id': audio_id})


@audio.route('/project/<int:project_id>/verse-audio/<text_id>/<int:verse_index>', methods=['POST'])
@login_required
def upload_verse_audio(project_id, text_id, verse_index):
    """Upload audio for a verse"""
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    file = request.files.get('audio')
    if not file or not file.filename:
        return jsonify({'error': 'No audio file'}), 400
    
    # Store file
    storage = get_storage()
    filename = secure_filename(file.filename)
    storage_path = f"audio/{project_id}/{text_id}/{verse_index}_{uuid.uuid4()}_{filename}"
    storage.store_file(file, storage_path)
    
    # Save to database (replace existing if any)
    existing = VerseAudio.query.filter_by(project_id=project_id, text_id=text_id, verse_index=verse_index).first()
    if existing:
        storage.delete_file(existing.storage_path)
        existing.storage_path = storage_path
        existing.original_filename = filename
        existing.file_size = len(file.read())
        file.seek(0)
    else:
        audio_record = VerseAudio(
            project_id=project_id, text_id=text_id, verse_index=verse_index,
            storage_path=storage_path, original_filename=filename,
            file_size=len(file.read()), content_type=file.content_type or 'audio/mpeg'
        )
        file.seek(0)
        db.session.add(audio_record)
    
    db.session.commit()
    return jsonify({'success': True})


@audio.route('/project/<int:project_id>/verse-audio/<int:audio_id>/download')
@login_required
def download_verse_audio(project_id, audio_id):
    """Download audio file"""
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    audio = VerseAudio.query.filter_by(id=audio_id, project_id=project_id).first_or_404()
    
    storage = get_storage()
    if hasattr(storage, 'base_path'):
        return send_file(io.BytesIO(storage.get_file(audio.storage_path)), 
                        download_name=audio.original_filename, mimetype=audio.content_type)
    else:
        return redirect(storage.get_file_url(audio.storage_path))


@audio.route('/project/<int:project_id>/verse-audio/<text_id>/<int:verse_index>/check')
@login_required
def check_verse_audio(project_id, text_id, verse_index):
    """Check if audio exists for a verse"""
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    audio = VerseAudio.query.filter_by(project_id=project_id, text_id=text_id, verse_index=verse_index).first()
    
    if audio:
        return jsonify({'exists': True, 'audio_id': audio.id})
    else:
        return jsonify({'exists': False})


@audio.route('/project/<int:project_id>/verse-audio/<int:audio_id>', methods=['DELETE'])
@login_required
def delete_verse_audio(project_id, audio_id):
    """Delete audio file"""
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    audio = VerseAudio.query.filter_by(id=audio_id, project_id=project_id).first_or_404()
    
    get_storage().delete_file(audio.storage_path)
    db.session.delete(audio)
    db.session.commit()
    return '', 204


@audio.route('/project/<int:project_id>/verse-audio/<text_id>/<int:verse_index>/tts-iterate', methods=['POST'])
@login_required 
def generate_tts_iteration(project_id, text_id, verse_index):
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    text = data.get('text', '').strip()
    voice = data.get('voice', 'onyx')
    instructions = data.get('instructions', '').strip()
    
    client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    
    # Build the speech request parameters
    speech_params = {
        "model": "gpt-4o-mini-tts",
        "voice": voice,
        "input": text
    }
    
    # Add instructions if provided (only works with gpt-4o-mini-tts)
    if instructions:
        speech_params["instructions"] = instructions
    
    response = client.audio.speech.create(**speech_params)
    
    audio_data = io.BytesIO(response.content)
    iteration_id = uuid.uuid4()
    storage = get_storage()
    storage_path = f"audio/{project_id}/{text_id}/iterations/{iteration_id}.mp3"
    storage.store_file(audio_data, storage_path)
    
    # Use shorter iteration ID to fit in 50 char text_id limit
    short_id = str(iteration_id).replace('-', '')[:16]
    
    audio_record = VerseAudio(
        project_id=project_id, 
        text_id=f"{text_id}_iter_{short_id}",
        verse_index=verse_index,
        storage_path=storage_path, 
        original_filename="iteration.mp3",
        file_size=len(response.content), 
        content_type='audio/mpeg'
    )
    db.session.add(audio_record)
    db.session.commit()
    
    return jsonify({'success': True, 'audio_id': audio_record.id})


@audio.route('/project/<int:project_id>/verse-audio/<text_id>/<int:verse_index>/apply', methods=['POST'])
@login_required
def apply_audio_iteration(project_id, text_id, verse_index):
    Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    audio_id = data.get('audioId')
    
    iteration_audio = VerseAudio.query.filter_by(id=audio_id, project_id=project_id).first_or_404()
    storage = get_storage()
    
    # Get existing audio for this verse
    existing = VerseAudio.query.filter_by(
        project_id=project_id, 
        text_id=text_id, 
        verse_index=verse_index
    ).first()
    
    # Copy iteration to current audio location
    iteration_data = storage.get_file(iteration_audio.storage_path)
    new_storage_path = f"audio/{project_id}/{text_id}/{verse_index}_{uuid.uuid4()}_applied.mp3"
    storage.store_file(io.BytesIO(iteration_data), new_storage_path)
    
    if existing:
        storage.delete_file(existing.storage_path)
        existing.storage_path = new_storage_path
        existing.file_size = len(iteration_data)
    else:
        new_audio = VerseAudio(
            project_id=project_id, text_id=text_id, verse_index=verse_index,
            storage_path=new_storage_path, original_filename="applied.mp3",
            file_size=len(iteration_data), content_type='audio/mpeg'
        )
        db.session.add(new_audio)
    
    db.session.commit()
    return jsonify({'success': True}) 