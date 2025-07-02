import json
import uuid
import threading
import traceback
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user, login_required

from models import db, Project, ProjectFile, FineTuningJob
from ai.fine_tuning import FineTuningService

fine_tuning = Blueprint('fine_tuning', __name__)


# Fine-tuning API routes
@fine_tuning.route('/project/<int:project_id>/fine-tuning/jobs', methods=['GET'])
@login_required
def get_fine_tuning_jobs(project_id):
    """Get all fine-tuning jobs for a project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        ft_service = FineTuningService()
        jobs = ft_service.get_project_jobs(project_id)
        return jsonify({'jobs': jobs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/preview', methods=['POST'])
@login_required
def preview_training_example(project_id):
    """Preview a training example from the file pair"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        preview = ft_service.get_training_example_preview(source_file_id, target_file_id, project_id)
        return jsonify(preview)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/jobs', methods=['POST'])
@login_required
def create_fine_tuning_job(project_id):
    """Create a new fine-tuning job"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        job_id = ft_service.start_fine_tuning_job(project_id, source_file_id, target_file_id, base_model)
        
        # Check if the job was created successfully
        job = db.session.get(FineTuningJob, job_id)
        
        if job.status == 'failed' and 'OpenAI API error' in (job.error_message or ''):
            # Job created but OpenAI upload failed
            return jsonify({
                'success': True,
                'job_id': job_id,
                'warning': True,
                'message': 'Training data generated and saved locally, but OpenAI upload failed. You can download the training data file from the project files section.',
                'error_details': job.error_message
            })
        elif job.status == 'failed':
            # Job creation failed entirely
            return jsonify({
                'success': False,
                'error': job.error_message or 'Unknown error occurred'
            }), 500
        else:
            # Job created successfully
            return jsonify({
                'success': True,
                'job_id': job_id,
                'message': 'Fine-tuning job started successfully'
            })
            
    except Exception as e:
        # Log the full error with traceback for debugging
        error_details = traceback.format_exc()
        print(f"Fine-tuning job creation failed:")
        print(f"Error: {str(e)}")
        print(f"Traceback:\n{error_details}")
        
        # Return the actual error message to help with debugging
        return jsonify({'error': f'Fine-tuning job failed: {str(e)}'}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/status', methods=['GET'])
@login_required
def get_fine_tuning_job_status(project_id, job_id):
    """Get the status of a specific fine-tuning job"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first()
    if not job:
        return jsonify({'error': 'Fine-tuning job not found'}), 404
    
    try:
        ft_service = FineTuningService()
        status = ft_service.check_job_status(job_id)
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/models', methods=['GET'])
@login_required
def get_fine_tuning_models(project_id):
    """Get available models for fine-tuning"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        ft_service = FineTuningService()
        models = ft_service.get_fine_tuning_models_for_project(project_id)
        return jsonify({'models': models})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/estimate', methods=['POST'])
@login_required
def estimate_fine_tuning_cost(project_id):
    """Estimate the cost of fine-tuning with given files"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    try:
        ft_service = FineTuningService()
        
        # Generate training data to count examples
        jsonl_content, num_examples = ft_service.create_training_data(
            source_file_id, target_file_id, project_id
        )
        
        estimated_cost = ft_service.estimate_cost(num_examples, base_model, project_id)
        
        return jsonify({
            'num_examples': num_examples,
            'estimated_cost_usd': estimated_cost,
            'base_model': base_model,
            'note': 'This is an estimate. Actual costs may vary based on final token count and training duration.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Instruction Fine-tuning API routes
@fine_tuning.route('/project/<int:project_id>/fine-tuning/instruction/preview', methods=['POST'])
@login_required
def preview_instruction_training_example(project_id):
    """Simple instruction fine-tuning preview without complex progress tracking"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    max_examples = data.get('max_examples', 50)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 50
    except (ValueError, TypeError):
        max_examples = 50
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    # Generate unique progress ID
    progress_id = str(uuid.uuid4())
    
    try:
        ft_service = FineTuningService()
        
        # Initialize progress
        ft_service.progress_cache[progress_id] = {
            "current": 0, 
            "total": max_examples, 
            "message": "Starting...",
            "status": "processing"
        }
        print(f"Stored progress for {progress_id}: {ft_service.progress_cache[progress_id]}")
        print(f"All progress keys: {list(ft_service.progress_cache.keys())}")
        
        def generate_training_data():
            try:
                with current_app.app_context():
                    def progress_callback(current, total, message):
                        ft_service.progress_cache[progress_id] = {
                            "current": current, 
                            "total": total, 
                            "message": message,
                            "status": "processing"
                        }
                        print(f"Progress update {progress_id}: {current}/{total} - {message}")
                    
                    # Use the context-aware method to generate training data with progress
                    jsonl_content, num_examples = ft_service.create_instruction_training_data_with_context(
                        source_file_id, target_file_id, project_id, max_examples, progress_callback
                    )
                    
                    if num_examples == 0:
                        ft_service.progress_cache[progress_id] = {
                            "status": "error",
                            "message": "No valid training examples found"
                        }
                        return
                    
                    # Parse the first example for preview
                    jsonl_lines = jsonl_content.strip().split('\n')
                    first_example = json.loads(jsonl_lines[0])
                    
                    # Extract info from the first example
                    system_prompt = first_example['messages'][0]['content']
                    user_prompt = first_example['messages'][1]['content']
                    assistant_response = first_example['messages'][2]['content']
                    
                    # Count context examples in the user prompt
                    context_count = user_prompt.count('\n') - 2 if 'TRANSLATION EXAMPLES:' in user_prompt else 0
                    context_count = max(0, context_count)
                    
                    # Extract the source text (last line of user prompt)
                    source_text = user_prompt.split('\n')[-1].replace('Translate this text: ', '')
                    
                    result = {
                        'total_lines': 'N/A',
                        'valid_pairs': num_examples,
                        'selected_examples': num_examples,
                        'max_examples': max_examples,
                        'source_filename': source_file.original_filename,
                        'target_filename': target_file.original_filename,
                        'preview_example': {
                            'line_number': 1,
                            'system_prompt': system_prompt,
                            'user_prompt': user_prompt,
                            'assistant_response': assistant_response,
                            'source_text': source_text,
                            'target_text': assistant_response,
                            'has_context': context_count > 0,
                            'context_examples_count': context_count
                        },
                        'jsonl_example': json.dumps(first_example, ensure_ascii=False, indent=2),
                        'status_msg': f'Generated {num_examples} training examples with context successfully',
                        'jsonl_content': jsonl_content  # Store the full JSONL content
                    }
                    
                    # Store result in progress cache
                    ft_service.progress_cache[progress_id] = {
                        "status": "completed",
                        "result": result
                    }
                    print(f"Completed {progress_id}: stored result")
                    
            except Exception as e:
                ft_service.progress_cache[progress_id] = {
                    "status": "error",
                    "message": f"Training data generation failed: {str(e)}"
                }
                print(f"Error {progress_id}: {str(e)}")
        
        # Start background thread
        thread = threading.Thread(target=generate_training_data)
        thread.daemon = True
        thread.start()
        
        return jsonify({'progress_id': progress_id})
        
    except Exception as e:
        # Clear progress on error
        progress_key = f"preview_{project_id}_{source_file_id}_{target_file_id}"
        ft_service = FineTuningService()
        if progress_key in ft_service.progress_cache:
            del ft_service.progress_cache[progress_key]
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/instruction/preview/progress/<progress_id>', methods=['GET'])
@login_required
def get_instruction_preview_progress(project_id, progress_id):
    """Get progress for instruction fine-tuning preview"""
    print(f"Progress request: project_id={project_id}, progress_id={progress_id}")
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    ft_service = FineTuningService()
    print(f"Progress cache keys: {list(ft_service.progress_cache.keys())}")
    
    if progress_id in ft_service.progress_cache:
        progress_data = ft_service.progress_cache[progress_id]
        print(f"Found progress: {progress_data}")
        return jsonify(progress_data)
    else:
        print(f"Progress not found for {progress_id}")
        return jsonify({'current': 0, 'total': 0, 'message': 'No progress found', 'status': 'not_found'})


@fine_tuning.route('/project/<int:project_id>/fine-tuning/instruction/jobs', methods=['POST'])
@login_required
def create_instruction_fine_tuning_job(project_id):
    """Create a new instruction fine-tuning job (original endpoint)"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    max_examples = data.get('max_examples', 100)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 100
    except (ValueError, TypeError):
        max_examples = 100
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        
        # Validate model - check both base models and fine-tuned models
        available_models = ft_service.get_fine_tuning_models_for_project(project_id)
        if base_model not in available_models:
            return jsonify({'error': f'Model {base_model} is not available for fine-tuning'}), 400
        
        # Create fine-tuning job record with instruction type
        job = FineTuningJob(
            project_id=project_id,
            source_file_id=source_file_id,
            target_file_id=target_file_id,
            base_model=base_model,
            status='preparing',
            is_instruction_tuning=True,
            query_text=None,
            max_examples=max_examples
        )
        db.session.add(job)
        db.session.commit()
        
        # Generate instruction training data using context-aware method
        def progress_callback(current, total, message):
            print(f"Job {job.id} progress: {current}/{total} - {message}")
        
        jsonl_content, num_examples = ft_service.create_instruction_training_data_with_context(
            source_file_id, target_file_id, project_id, max_examples, progress_callback
        )
        
        if num_examples == 0:
            job.status = 'failed'
            job.error_message = 'No valid instruction examples found'
            db.session.commit()
            return jsonify({'success': False, 'error': 'No valid instruction examples found'}), 400
        
        # Save JSONL file locally FIRST
        import io
        file_id = str(uuid.uuid4())
        jsonl_filename = f"instruction_tuning_{job.id}_{file_id}.jsonl"
        local_path = f"projects/{project_id}/fine_tuning/{jsonl_filename}"
        
        # Store JSONL file locally
        jsonl_file = io.BytesIO(jsonl_content.encode('utf-8'))
        ft_service.storage.store_file(jsonl_file, local_path)
        job.training_file_path = local_path
        
        # Create a ProjectFile record for the JSONL file
        jsonl_project_file = ProjectFile(
            project_id=project_id,
            original_filename=f"instruction_training_job_{job.id}.jsonl",
            storage_path=local_path,
            file_type='training_data',
            content_type='application/jsonl',
            file_size=len(jsonl_content.encode('utf-8')),
            line_count=num_examples
        )
        db.session.add(jsonl_project_file)
        db.session.commit()
        
        # Try to upload to OpenAI
        try:
            # Reset file pointer for OpenAI upload
            jsonl_file.seek(0)
            
            # Upload to OpenAI
            upload_response = ft_service.client.files.create(
                file=jsonl_file,
                purpose="fine-tune"
            )
            
            job.openai_file_id = upload_response.id
            
            # Create fine-tuning job on OpenAI
            ft_response = ft_service.client.fine_tuning.jobs.create(
                training_file=upload_response.id,
                model=base_model
            )
            
            job.openai_job_id = ft_response.id
            job.status = 'validating'
            job.estimated_cost = ft_service.estimate_cost(num_examples, base_model, project_id)
            job.training_examples = num_examples
            
            db.session.commit()
            job_id = job.id
            
        except Exception as openai_error:
            # OpenAI upload/job creation failed, but we still have the local file
            job.status = 'failed'
            job.error_message = f'OpenAI API error: {str(openai_error)}'
            db.session.commit()
            job_id = job.id
        
        # Check if the job was created successfully
        job = db.session.get(FineTuningJob, job_id)
        
        if job.status == 'failed' and 'OpenAI API error' in (job.error_message or ''):
            # Job created but OpenAI upload failed
            return jsonify({
                'success': True,
                'job_id': job_id,
                'warning': True,
                'message': 'Instruction training data generated and saved locally, but OpenAI upload failed. You can download the training data file from the project files section.',
                'error_details': job.error_message
            })
        elif job.status == 'failed':
            # Job creation failed entirely
            return jsonify({
                'success': False,
                'error': job.error_message or 'Unknown error occurred'
            }), 500
        else:
            # Job created successfully
            return jsonify({
                'success': True,
                'job_id': job_id,
                'message': 'Instruction fine-tuning job started successfully'
            })
            
    except Exception as e:
        # Log the full error with traceback for debugging
        error_details = traceback.format_exc()
        print(f"Instruction fine-tuning job creation failed:")
        print(f"Error: {str(e)}")
        print(f"Traceback:\n{error_details}")
        
        # Return the actual error message to help with debugging
        return jsonify({'error': f'Instruction fine-tuning job failed: {str(e)}'}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/instruction/estimate', methods=['POST'])
@login_required
def estimate_instruction_fine_tuning_cost(project_id):
    """Simple estimate for instruction fine-tuning cost without processing examples"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    max_examples = data.get('max_examples', 100)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 100
    except (ValueError, TypeError):
        max_examples = 100
    
    try:
        ft_service = FineTuningService()
        
        # Get simple estimate without processing examples
        estimate_data = ft_service.get_instruction_tuning_simple_estimate(
            source_file_id, target_file_id, project_id, max_examples
        )
        
        estimated_cost = ft_service.estimate_cost(estimate_data['actual_examples'], base_model, project_id)
        
        return jsonify({
            'num_examples': estimate_data['actual_examples'],
            'valid_pairs': estimate_data['valid_pairs'],
            'max_examples': max_examples,
            'estimated_cost_usd': estimated_cost,
            'base_model': base_model,
            'note': 'This is a simple estimate. Click "Get Training Data" to process examples and see preview.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/rename', methods=['POST'])
@login_required
def rename_fine_tuning_model(project_id, job_id):
    """Rename a fine-tuned model"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    data = request.get_json()
    new_name = data.get('name', '').strip()
    
    if not new_name:
        return jsonify({'error': 'Name cannot be empty'}), 400
        
    if len(new_name) > 255:
        return jsonify({'error': 'Name is too long (maximum 255 characters)'}), 400
    
    try:
        job.display_name = new_name
        db.session.commit()
        
        return jsonify({
            'success': True,
            'name': job.get_display_name()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@fine_tuning.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/toggle-visibility', methods=['POST'])
@login_required
def toggle_model_visibility(project_id, job_id):
    """Toggle the visibility of a fine-tuned model"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    if job.status != 'completed':
        return jsonify({'error': 'Can only toggle visibility of completed models'}), 400
    
    try:
        job.hidden = not job.hidden
        db.session.commit()
        
        return jsonify({
            'success': True,
            'hidden': job.hidden,
            'message': 'Model hidden from selection' if job.hidden else 'Model visible in selection'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500 