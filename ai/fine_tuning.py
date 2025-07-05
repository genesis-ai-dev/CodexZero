import os
import json
import uuid
import random
from typing import Dict, List, Tuple, Optional, Any
from openai import OpenAI
from models import Project, ProjectFile, FineTuningJob, db
from storage import get_storage


import time
from datetime import datetime

# IMPORTANT NOTE: Text fine-tuning model support as of 2025
# - GPT-4o and GPT-4o-mini do NOT support fine-tuning for text tasks
# - Only GPT-4.1 series models support text fine-tuning:
#   * gpt-4.1 - Most capable
#   * gpt-4.1-mini - Fast and cost-effective  
#   * gpt-4.1-nano - Ultra-fast and ultra-cost-effective
# - Previously fine-tuned models can be used as base models for further fine-tuning
# For the most current information, check: https://platform.openai.com/docs/guides/fine-tuning

def safe_decode_content(file_content):
    """Safely decode file content to string"""
    if isinstance(file_content, bytes):
        return file_content.decode('utf-8', errors='replace')
    return str(file_content)

def _create_instruction_prompt(source_text: str, context_examples: List[str] = None) -> str:
    """Create instruction prompt with optional context examples"""
    if context_examples:
        context_parts = ["TRANSLATION EXAMPLES:"]
        context_parts.extend(context_examples)
        context_parts.append("")
        context_parts.append("Following the style and patterns shown in the examples above:")
        context_parts.append(f"Translate this text: {source_text}")
        context_parts.append("")
        context_parts.append("Provide your final translation inside <translation></translation> tags.")
        return '\n'.join(context_parts)
    else:
        return f"Translate this text: {source_text}\n\nProvide your final translation inside <translation></translation> tags."

def _create_training_example(system_prompt: str, user_prompt: str, target_text: str) -> Dict:
    """Create a training example in the proper format"""
    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": f"<translation>{target_text}</translation>"}
        ]
    }

# Global progress cache that persists across requests
_global_progress_cache = {}

class FineTuningService:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.storage = get_storage()
        
        # Base models for fine-tuning with cost information
        # Note: Only GPT-4.1 series models support text fine-tuning as of 2024
        self.base_models = {
            'gpt-4.1': {
                'name': 'GPT-4.1',
                'description': 'Most capable model with fine-tuning support',
                'cost_per_1k_tokens': 0.015,
                'max_context': 128000,
                'type': 'base'
            },
            'gpt-4.1-mini': {
                'name': 'GPT-4.1 Mini',
                'description': 'Fast and cost-effective with fine-tuning support',
                'cost_per_1k_tokens': 0.003,
                'max_context': 128000,
                'type': 'base'
            },
            'gpt-4.1-nano': {
                'name': 'GPT-4.1 Nano',
                'description': 'Ultra-fast and ultra-cost-effective with fine-tuning support',
                'cost_per_1k_tokens': 0.001,
                'max_context': 128000,
                'type': 'base'
            }
        }
    
    @property
    def progress_cache(self):
        """Use global progress cache that persists across requests"""
        return _global_progress_cache
    
    def get_available_models(self) -> Dict:
        """Get available models for any purpose"""
        return self.get_all_models()
    
    def get_all_models(self) -> Dict:
        """Get all available models for translation (fine-tuned GPT-4.1 + Claude 3.5 Sonnet only)"""
        models = {}
        
        # Add only Claude 3.5 Sonnet for translation
        models['claude-3-5-sonnet-20241022'] = {
            'name': 'Claude 3.5 Sonnet',
            'description': 'Anthropic\'s most capable model for complex reasoning',
            'cost_per_1k_tokens': 0.015,
            'max_context': 200000,
            'type': 'base'
        }
        
        # Add fine-tuned models with custom names (exclude hidden models)
        from models import FineTuningJob
        completed_jobs = FineTuningJob.query.filter_by(
            status='completed',
            hidden=False  # Exclude hidden models
        ).filter(
            FineTuningJob.model_name.isnot(None),
            FineTuningJob.display_name.isnot(None)  # Only show models with custom names
        ).order_by(FineTuningJob.completed_at.desc()).all()
        
        for job in completed_jobs:
            models[job.model_name] = {
                'name': job.display_name,
                'description': f"Custom model from {job.source_file.original_filename} → {job.target_file.original_filename}",
                'cost_per_1k_tokens': self.base_models.get('gpt-4.1-mini', {}).get('cost_per_1k_tokens', 0.003),
                'max_context': 128000,
                'type': 'fine_tuned',
                'created_at': job.completed_at.isoformat(),
                'base_model': job.base_model,
                'training_examples': job.training_examples,
                'job_id': job.id
            }
        
        return models
    
    def get_fine_tuning_models_for_project(self, project_id: int) -> Dict:
        """Get available models for fine-tuning for a specific project (GPT-4.1 models only)"""
        # Only allow GPT-4.1 base models for fine-tuning
        models = self.base_models.copy()
        
        # Add project-specific fine-tuned models with custom names (exclude hidden models)
        from models import FineTuningJob
        completed_jobs = FineTuningJob.query.filter_by(
            project_id=project_id,
            status='completed',
            hidden=False  # Exclude hidden models
        ).filter(
            FineTuningJob.model_name.isnot(None),
            FineTuningJob.display_name.isnot(None)  # Only show models with custom names
        ).order_by(FineTuningJob.completed_at.desc()).all()
        
        for job in completed_jobs:
            models[job.model_name] = {
                'name': job.display_name,
                'description': f"Custom model from {job.source_file.original_filename} → {job.target_file.original_filename}",
                'cost_per_1k_tokens': self.base_models.get('gpt-4.1-mini', {}).get('cost_per_1k_tokens', 0.003),
                'max_context': 128000,
                'type': 'fine_tuned',
                'created_at': job.completed_at.isoformat(),
                'base_model': job.base_model,
                'training_examples': job.training_examples
            }
        
        return models
    
    def get_training_example_preview(self, source_file_id: int, target_file_id: int, project_id: int) -> Dict:
        """
        Get a preview of what a training example will look like.
        Returns a sample training example and summary stats.
        """
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details for system prompt
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment - don't filter empty lines independently
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Find valid examples (both lines must be longer than 10 characters)
        valid_examples = []
        
        # Create project-specific system prompt
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        for i, (source_line, target_line) in enumerate(zip(source_lines, target_lines)):
            # Only include if BOTH lines are substantial (maintain alignment)
            if len(source_line) > 10 and len(target_line) > 10:
                example = {
                    "line_number": i + 1,  # Original line number in file
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Translate this text: {source_line}\n\nProvide your final translation inside <translation></translation> tags."},
                        {"role": "assistant", "content": f"<translation>{target_line}</translation>"}
                    ],
                    "source_text": source_line,
                    "target_text": target_line
                }
                valid_examples.append(example)
        
        if not valid_examples:
            raise ValueError("No valid training examples found (both source and target lines must be longer than 10 characters)")
        
        # Return the first valid example as preview
        preview_example = valid_examples[0]
        
        # Generate the actual JSONL format for this example
        jsonl_example = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Translate this text: {preview_example['source_text']}\n\nProvide your final translation inside <translation></translation> tags."},
                {"role": "assistant", "content": f"<translation>{preview_example['target_text']}</translation>"}
            ]
        }
        
        return {
            "total_lines": len(source_lines),
            "valid_examples": len(valid_examples),
            "filtered_out": len(source_lines) - len(valid_examples),
            "source_filename": source_file.original_filename,
            "target_filename": target_file.original_filename,
            "preview_example": {
                "line_number": preview_example["line_number"],
                "system_prompt": preview_example["messages"][0]["content"],
                "user_prompt": preview_example["messages"][1]["content"],
                "assistant_response": preview_example["messages"][2]["content"],
                "source_text": preview_example["source_text"],
                "target_text": preview_example["target_text"]
            },
            "jsonl_example": json.dumps(jsonl_example, ensure_ascii=False, indent=2)
        }
    
    def create_training_data(self, source_file_id: int, target_file_id: int, project_id: int) -> Tuple[str, int]:
        """
        Generate JSONL training data from paired source/target files.
        Returns (jsonl_content, num_examples)
        """
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details for system prompt
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment - don't filter empty lines independently
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Generate JSONL training examples
        training_examples = []
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        # Create project-specific system prompt
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        for source_line, target_line in zip(source_lines, target_lines):
            # Only include if BOTH lines are substantial (maintain alignment)
            if len(source_line) > 10 and len(target_line) > 10:
                example = {
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Translate this text: {source_line}\n\nProvide your final translation inside <translation></translation> tags."},
                        {"role": "assistant", "content": f"<translation>{target_line}</translation>"}
                    ]
                }
                training_examples.append(example)
        
        # Convert to JSONL format
        jsonl_content = '\n'.join([json.dumps(example) for example in training_examples])
        
        return jsonl_content, len(training_examples)
    
    def start_fine_tuning_job(self, project_id: int, source_file_id: int, target_file_id: int, base_model: str = 'gpt-4.1-mini') -> int:
        """
        Start a fine-tuning job. Returns the FineTuningJob ID.
        """
        # Validate model - check both base models and fine-tuned models
        available_models = self.get_fine_tuning_models_for_project(project_id)
        if base_model not in available_models:
            raise ValueError(f"Model {base_model} is not available for fine-tuning")
        
        # Create fine-tuning job record
        job = FineTuningJob(
            project_id=project_id,
            source_file_id=source_file_id,
            target_file_id=target_file_id,
            base_model=base_model,
            status='preparing'
        )
        db.session.add(job)
        db.session.commit()
        
        try:
            # Generate training data
            jsonl_content, num_examples = self.create_training_data(source_file_id, target_file_id, project_id)
            
            if num_examples == 0:
                job.status = 'failed'
                job.error_message = 'No valid training examples found'
                db.session.commit()
                raise ValueError("No valid training examples found")
            
            # Save JSONL file locally FIRST (before trying OpenAI upload)
            file_id = str(uuid.uuid4())
            jsonl_filename = f"fine_tuning_{job.id}_{file_id}.jsonl"
            local_path = f"projects/{project_id}/fine_tuning/{jsonl_filename}"
            
            # Store JSONL file locally
            import io
            jsonl_file = io.BytesIO(jsonl_content.encode('utf-8'))
            self.storage.store_file(jsonl_file, local_path)
            job.training_file_path = local_path
            
            # Create a ProjectFile record for the JSONL file so it appears in the files section
            jsonl_project_file = ProjectFile(
                project_id=project_id,
                original_filename=f"training_data_job_{job.id}.jsonl",
                storage_path=local_path,
                file_type='training_data',  # Special type for JSONL files
                content_type='application/jsonl',
                file_size=len(jsonl_content.encode('utf-8')),
                line_count=num_examples
            )
            db.session.add(jsonl_project_file)
            db.session.commit()
            
            # Now try to upload to OpenAI (this might fail due to connection issues)
            try:
                # Reset file pointer for OpenAI upload
                jsonl_file.seek(0)
                
                # Upload to OpenAI
                upload_response = self.client.files.create(
                    file=jsonl_file,
                    purpose="fine-tune"
                )
                
                job.openai_file_id = upload_response.id
                
                # Create fine-tuning job on OpenAI
                ft_response = self.client.fine_tuning.jobs.create(
                    training_file=upload_response.id,
                    model=base_model
                )
                
                job.openai_job_id = ft_response.id
                job.status = 'validating'
                job.estimated_cost = self.estimate_cost(num_examples, base_model, project_id)
                
            except Exception as openai_error:
                # OpenAI upload/job creation failed, but we still have the local file
                job.status = 'failed'
                job.error_message = f'OpenAI API error: {str(openai_error)}'
                print(f"OpenAI API error for job {job.id}: {openai_error}")
                # Don't raise - we still want to return the job ID so user can download the JSONL
            
            db.session.commit()
            return job.id
            
        except Exception as e:
            # Update job status on any other error
            job.status = 'failed'
            job.error_message = str(e)
            db.session.commit()
            raise
    
    def check_job_status(self, job_id: int) -> Dict:
        """
        Check the status of a fine-tuning job.
        """
        job = FineTuningJob.query.get(job_id)
        if not job:
            raise ValueError("Job not found")
        
        if not job.openai_job_id:
            return {
                'status': job.status,
                'message': job.progress_message or 'Job not yet submitted to OpenAI'
            }
        
        try:
            # Get job status from OpenAI
            ft_job = self.client.fine_tuning.jobs.retrieve(job.openai_job_id)
            
            # Update local job status
            if ft_job.status == 'succeeded':
                job.status = 'completed'
                job.completed_at = datetime.utcnow()
                job.model_name = ft_job.fine_tuned_model
                job.trained_tokens = ft_job.trained_tokens
                job.progress_message = f"Fine-tuning completed! Model: {ft_job.fine_tuned_model}"
                
            elif ft_job.status == 'failed':
                job.status = 'failed'
                # Handle error message more robustly
                error_obj = getattr(ft_job, 'error', None)
                if error_obj:
                    if hasattr(error_obj, 'get') and callable(getattr(error_obj, 'get')):
                        # error is a dict-like object
                        job.error_message = error_obj.get('message', 'Unknown error')
                    elif hasattr(error_obj, 'message'):
                        # error has a message attribute
                        job.error_message = str(error_obj.message)
                    else:
                        # error is something else, convert to string
                        job.error_message = str(error_obj)
                else:
                    job.error_message = 'Fine-tuning failed (no error details available)'
                job.progress_message = "Fine-tuning failed"
                
            elif ft_job.status in ['running', 'validating_files']:
                job.status = 'training'
                job.progress_message = f"Status: {ft_job.status}"
                
            db.session.commit()
            
            return {
                'status': job.status,
                'message': job.progress_message,
                'openai_status': ft_job.status,
                'model_name': job.model_name,
                'trained_tokens': job.trained_tokens,
                'training_examples': job.training_examples,
                'base_model': job.base_model
            }
            
        except Exception as e:
            job.error_message = str(e)
            db.session.commit()
            return {
                'status': 'error',
                'message': f"Error checking status: {str(e)}"
            }
    
    def get_project_jobs(self, project_id: int) -> List[Dict]:
        """
        Get all fine-tuning jobs for a project.
        Automatically checks and updates status for active jobs.
        """
        jobs = FineTuningJob.query.filter_by(project_id=project_id).order_by(
            FineTuningJob.created_at.desc()
        ).all()
        
        result = []
        for job in jobs:
            # Auto-check status for active jobs
            if job.status in ['training', 'uploading', 'preparing', 'validating'] and job.openai_job_id:
                try:
                    self.check_job_status(job.id)
                    # Refresh the job object after status update
                    db.session.refresh(job)
                except Exception as e:
                    print(f"Error checking status for job {job.id}: {e}")
            
            result.append({
                'id': job.id,
                'status': job.status,
                'base_model': job.base_model,
                'model_name': job.model_name,
                'display_name': job.display_name,
                'hidden': job.hidden,
                'source_file': job.source_file.original_filename if job.source_file else 'Unknown',
                'target_file': job.target_file.original_filename if job.target_file else 'Unknown',
                'training_examples': job.training_examples,
                'estimated_cost': job.estimated_cost,
                'created_at': job.created_at.isoformat(),
                'completed_at': job.completed_at.isoformat() if job.completed_at else None,
                'progress_message': job.progress_message,
                'error_message': job.error_message,
                'is_instruction_tuning': job.is_instruction_tuning or False,
                'query_text': job.query_text,
                'max_examples': job.max_examples
            })
        
        return result
    
    def estimate_cost(self, num_examples: int, base_model: str = 'gpt-4.1-mini', project_id: int = None) -> float:
        """
        Estimate fine-tuning cost based on number of examples and model.
        """
        # Get available models including fine-tuned ones if project_id is provided
        if project_id:
            available_models = self.get_fine_tuning_models_for_project(project_id)
        else:
            available_models = self.base_models
            
        if base_model not in available_models:
            base_model = 'gpt-4.1-mini'  # Default fallback
        
        # Rough estimate: average 50 tokens per example, 3 epochs default
        avg_tokens_per_example = 50
        default_epochs = 3
        total_tokens = num_examples * avg_tokens_per_example * default_epochs
        
        # Get cost per 1K tokens for the specific model
        cost_per_1k_tokens = available_models[base_model]['cost_per_1k_tokens']
        
        estimated_cost = (total_tokens / 1000) * cost_per_1k_tokens
        return round(estimated_cost, 4)
    
    def _get_training_instructions(self, project_id: int, source_file_id: int, target_file_id: int, project) -> str:
        """Get training instructions including file context and project instructions"""
        from translation import _get_file_context
        
        instruction_parts = []
        
        # Add target file context only
        target_file_id_str = f"file_{target_file_id}"
        file_context = _get_file_context(project_id, target_file_id_str)
        if file_context:
            instruction_parts.append(file_context)
        
        # Add project instructions
        if project.instructions and project.instructions.strip():
            instruction_parts.append(project.instructions.strip())
        
        return "\n\n".join(instruction_parts) if instruction_parts else None
    
    def get_instruction_tuning_preview(self, source_file_id: int, target_file_id: int, project_id: int, max_examples: int = 100) -> Dict:
        """
        Get a preview of what instruction fine-tuning examples will look like.
        Actually generates multiple training examples and shows the first one as preview.
        """
        from translation import _get_translation_examples
        
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Find valid examples (both lines must be longer than 10 characters)
        valid_pairs = []
        for i, (source_line, target_line) in enumerate(zip(source_lines, target_lines)):
            if len(source_line) > 10 and len(target_line) > 10:
                valid_pairs.append({
                    "line_number": i + 1,
                    "source_text": source_line,
                    "target_text": target_line
                })
        
        if not valid_pairs:
            raise ValueError("No valid training examples found (both source and target lines must be longer than 10 characters)")
        
        # Select up to max_examples randomly - this is the actual number of training examples
        if len(valid_pairs) > max_examples:
            selected_pairs = random.sample(valid_pairs, max_examples)
        else:
            selected_pairs = valid_pairs
        
        # Get the first example for preview display
        preview_pair = selected_pairs[0]
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        # Create project-specific system prompt
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        # Use source text as query to find context examples (limit to 5 for cleaner display)
        source_file_id_str = f"file_{source_file_id}"
        target_file_id_str = f"file_{target_file_id}"
        
        try:
            context_examples, status_msg = _get_translation_examples(
                project_id, source_file_id_str, target_file_id_str, preview_pair["source_text"]
            )
            
            # Remove the exact match if it appears in context and limit to 5 examples
            context_examples = [ex for ex in context_examples if preview_pair["source_text"] not in ex][:5]
            
        except Exception as e:
            context_examples = []
            status_msg = f"Context search failed: {str(e)}"
        
        # Create context-aware instruction for the preview
        if context_examples:
            context_parts = ["TRANSLATION EXAMPLES:"]
            context_parts.extend(context_examples)
            context_parts.append("")
            context_parts.append("Following the style and patterns shown in the examples above:")
            context_parts.append(f"Translate this text: {preview_pair['source_text']}")
            context_parts.append("")
            context_parts.append("Provide your final translation inside <translation></translation> tags.")
            user_prompt = '\n'.join(context_parts)
        else:
            user_prompt = f"Translate this text: {preview_pair['source_text']}\n\nProvide your final translation inside <translation></translation> tags."
        
        # Generate JSONL format for the preview
        jsonl_example = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": f"<translation>{preview_pair['target_text']}</translation>"}
            ]
        }
        
        return {
            "total_lines": len(source_lines),
            "valid_pairs": len(valid_pairs),
            "selected_examples": len(selected_pairs),  # This is the actual number of training examples
            "max_examples": max_examples,
            "source_filename": source_file.original_filename,
            "target_filename": target_file.original_filename,
            "preview_example": {
                "line_number": preview_pair["line_number"],
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "assistant_response": preview_pair["target_text"],
                "source_text": preview_pair["source_text"],
                "target_text": preview_pair["target_text"],
                "has_context": len(context_examples) > 0,
                "context_examples_count": len(context_examples)
            },
            "jsonl_example": json.dumps(jsonl_example, ensure_ascii=False, indent=2),
            "status_msg": status_msg
        }
    
    def create_instruction_training_data(self, source_file_id: int, target_file_id: int, project_id: int, max_examples: int = 100, progress_callback=None) -> Tuple[str, int]:
        """
        Generate JSONL instruction training data.
        Selects non-blank lines and uses each source text as query for context examples.
        Returns (jsonl_content, num_examples)
        """
        from translation import _get_translation_examples
        
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        if progress_callback:
            progress_callback(0, max_examples, "Reading files...")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Find valid examples (both lines must be longer than 10 characters)
        valid_pairs = []
        for i, (source_line, target_line) in enumerate(zip(source_lines, target_lines)):
            if len(source_line) > 10 and len(target_line) > 10:
                valid_pairs.append({
                    "line_number": i + 1,
                    "source_text": source_line,
                    "target_text": target_line
                })
        
        if not valid_pairs:
            raise ValueError("No valid training examples found (both source and target lines must be longer than 10 characters)")
        
        if progress_callback:
            progress_callback(0, max_examples, "Selecting examples...")
        
        # Select up to max_examples randomly
        if len(valid_pairs) > max_examples:
            selected_pairs = random.sample(valid_pairs, max_examples)
        else:
            selected_pairs = valid_pairs
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        # Create instruction fine-tuning examples
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        source_file_id_str = f"file_{source_file_id}"
        target_file_id_str = f"file_{target_file_id}"
        
        training_examples = []
        
        for i, pair in enumerate(selected_pairs):
            source_text = pair["source_text"]
            target_text = pair["target_text"]
            
            if progress_callback:
                progress_callback(i + 1, len(selected_pairs), f"Processing example {i + 1}/{len(selected_pairs)}")
            
            try:
                # Use source text as query to find context examples
                context_examples, _ = _get_translation_examples(
                    project_id, source_file_id_str, target_file_id_str, source_text
                )
                
                # Remove the exact match if it appears in context and limit to 5 examples
                context_examples = [ex for ex in context_examples if source_text not in ex][:5]
                
            except Exception:
                context_examples = []
            
            # Create context-aware instruction
            user_prompt = _create_instruction_prompt(source_text, context_examples)
            training_example = _create_training_example(system_prompt, user_prompt, target_text)
            training_examples.append(training_example)
        
        if progress_callback:
            progress_callback(len(selected_pairs), len(selected_pairs), f"Generated {len(training_examples)} training examples")
        
        if not training_examples:
            raise ValueError("No valid training examples could be created")
        
        # Convert to JSONL format
        jsonl_content = '\n'.join([json.dumps(example) for example in training_examples])
        
        return jsonl_content, len(training_examples)
    
    def start_instruction_fine_tuning_job(self, project_id: int, source_file_id: int, target_file_id: int, base_model: str = 'gpt-4.1-mini', max_examples: int = 100) -> int:
        """
        Start an instruction fine-tuning job.
        Selects non-blank lines and uses source text as query for context examples.
        Returns the FineTuningJob ID.
        """
        # Validate model - check both base models and fine-tuned models
        available_models = self.get_fine_tuning_models_for_project(project_id)
        if base_model not in available_models:
            raise ValueError(f"Model {base_model} is not available for fine-tuning")
        
        # Create fine-tuning job record with instruction type
        job = FineTuningJob(
            project_id=project_id,
            source_file_id=source_file_id,
            target_file_id=target_file_id,
            base_model=base_model,
            status='preparing',
            is_instruction_tuning=True,
            query_text=None,  # Not needed for this approach
            max_examples=max_examples
        )
        db.session.add(job)
        db.session.commit()
        
        try:
            # Generate instruction training data (this will take time and show progress)
            jsonl_content, num_examples = self.create_instruction_training_data(
                source_file_id, target_file_id, project_id, max_examples
            )
            
            if num_examples == 0:
                job.status = 'failed'
                job.error_message = 'No valid instruction examples found'
                db.session.commit()
                raise ValueError("No valid instruction examples found")
            
            # Save JSONL file locally FIRST
            file_id = str(uuid.uuid4())
            jsonl_filename = f"instruction_tuning_{job.id}_{file_id}.jsonl"
            local_path = f"projects/{project_id}/fine_tuning/{jsonl_filename}"
            
            # Store JSONL file locally
            import io
            jsonl_file = io.BytesIO(jsonl_content.encode('utf-8'))
            self.storage.store_file(jsonl_file, local_path)
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
                upload_response = self.client.files.create(
                    file=jsonl_file,
                    purpose="fine-tune"
                )
                
                job.openai_file_id = upload_response.id
                
                # Create fine-tuning job on OpenAI
                ft_response = self.client.fine_tuning.jobs.create(
                    training_file=upload_response.id,
                    model=base_model
                )
                
                job.openai_job_id = ft_response.id
                job.status = 'validating'
                job.estimated_cost = self.estimate_cost(num_examples, base_model, project_id)
                job.training_examples = num_examples
                
            except Exception as openai_error:
                # OpenAI upload/job creation failed, but we still have the local file
                job.status = 'failed'
                job.error_message = f'OpenAI API error: {str(openai_error)}'
                print(f"OpenAI API error for instruction job {job.id}: {openai_error}")
            
            db.session.commit()
            return job.id
            
        except Exception as e:
            # Update job status on any other error
            job.status = 'failed'
            job.error_message = str(e)
            db.session.commit()
            raise
    
    def get_instruction_tuning_simple_estimate(self, source_file_id: int, target_file_id: int, project_id: int, max_examples: int = 100) -> Dict:
        """
        Get a simple estimate for instruction fine-tuning without processing examples.
        Just counts valid lines and estimates cost.
        """
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Count valid examples (both lines must be longer than 10 characters)
        valid_pairs = 0
        for source_line, target_line in zip(source_lines, target_lines):
            if len(source_line) > 10 and len(target_line) > 10:
                valid_pairs += 1
        
        # Calculate how many examples we'll actually use
        actual_examples = min(valid_pairs, max_examples)
        
        return {
            "total_lines": len(source_lines),
            "valid_pairs": valid_pairs,
            "max_examples": max_examples,
            "actual_examples": actual_examples,
            "source_filename": source_file.original_filename,
            "target_filename": target_file.original_filename
        }
    
    def create_instruction_training_data_with_progress(self, source_file_id: int, target_file_id: int, project_id: int, max_examples: int = 100, progress_callback=None) -> Tuple[str, int]:
        """
        Generate instruction training data with progress tracking.
        Returns (jsonl_content, num_examples)
        """
        from translation import _get_translation_examples
        
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        if progress_callback:
            progress_callback(0, max_examples, "Reading files...")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Find valid examples (both lines must be longer than 10 characters)
        valid_pairs = []
        for i, (source_line, target_line) in enumerate(zip(source_lines, target_lines)):
            if len(source_line) > 10 and len(target_line) > 10:
                valid_pairs.append({
                    "line_number": i + 1,
                    "source_text": source_line,
                    "target_text": target_line
                })
        
        if not valid_pairs:
            raise ValueError("No valid training examples found (both source and target lines must be longer than 10 characters)")
        
        if progress_callback:
            progress_callback(0, max_examples, "Selecting examples...")
        
        # Select up to max_examples randomly
        if len(valid_pairs) > max_examples:
            selected_pairs = random.sample(valid_pairs, max_examples)
        else:
            selected_pairs = valid_pairs
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        # Create instruction fine-tuning examples
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        source_file_id_str = f"file_{source_file_id}"
        target_file_id_str = f"file_{target_file_id}"
        
        training_examples = []
        
        for i, pair in enumerate(selected_pairs):
            source_text = pair["source_text"]
            target_text = pair["target_text"]
            
            if progress_callback:
                progress_callback(i + 1, len(selected_pairs), f"Processing example {i + 1}/{len(selected_pairs)}")
            
            try:
                # Use source text as query to find context examples
                context_examples, _ = _get_translation_examples(
                    project_id, source_file_id_str, target_file_id_str, source_text
                )
                
                # Remove the exact match if it appears in context and limit to 3 examples
                context_examples = [ex for ex in context_examples if source_text not in ex][:3]
                
            except Exception:
                context_examples = []
            
            # Create context-aware instruction
            user_prompt = _create_instruction_prompt(source_text, context_examples)
            training_example = _create_training_example(system_prompt, user_prompt, target_text)
            training_examples.append(training_example)
        
        if progress_callback:
            progress_callback(len(selected_pairs), len(selected_pairs), f"Generated {len(training_examples)} training examples")
        
        if not training_examples:
            raise ValueError("No valid training examples could be created")
        
        # Convert to JSONL format
        jsonl_content = '\n'.join([json.dumps(example) for example in training_examples])
        
        return jsonl_content, len(training_examples)
    
    def _process_instruction_training_pairs(self, selected_pairs: List[Dict], project: Project, 
                                          source_file_id: int, target_file_id: int, 
                                          project_id: int, progress_callback=None) -> List[Dict]:
        """Process training pairs with context examples - helper method to reduce duplication"""
        from translation import _get_translation_examples
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        source_file_id_str = f"file_{source_file_id}"
        target_file_id_str = f"file_{target_file_id}"
        
        training_examples = []
        
        for i, pair in enumerate(selected_pairs):
            source_text = pair["source_text"]
            target_text = pair["target_text"]
            
            if progress_callback:
                progress_callback(i + 1, len(selected_pairs), f"Processing example {i + 1}/{len(selected_pairs)}")
            
            try:
                # Use source text as query to find context examples
                context_examples, _ = _get_translation_examples(
                    project_id, source_file_id_str, target_file_id_str, source_text
                )
                
                # Remove the exact match if it appears in context and limit examples
                context_examples = [ex for ex in context_examples if source_text not in ex][:5]
                
            except Exception:
                context_examples = []
            
            # Create context-aware instruction
            user_prompt = _create_instruction_prompt(source_text, context_examples)
            training_example = _create_training_example(system_prompt, user_prompt, target_text)
            training_examples.append(training_example)
        
        return training_examples

    def get_progress(self, progress_id: str) -> Dict:
        """Get progress for a given progress ID"""
        return self.progress_cache.get(progress_id, {"current": 0, "total": 0, "status": "not_found", "message": "Progress not found"})
    
    def clear_progress(self, progress_id: str):
        """Clear progress data for a given progress ID"""
        if progress_id in self.progress_cache:
            del self.progress_cache[progress_id]
    
    def create_instruction_training_data_with_context(self, source_file_id: int, target_file_id: int, project_id: int, max_examples: int = 100, progress_callback=None) -> Tuple[str, int]:
        """
        Generate context-aware instruction training data.
        For each training example, finds contextual examples to include in the prompt.
        Returns (jsonl_content, num_examples)
        """
        from translation import _get_translation_examples
        
        # Load source and target files
        source_file = ProjectFile.query.get(source_file_id)
        target_file = ProjectFile.query.get(target_file_id)
        
        if not source_file or not target_file:
            raise ValueError("Source or target file not found")
        
        # Get project details
        project = Project.query.get(project_id)
        if not project:
            raise ValueError("Project not found")
        
        if progress_callback:
            progress_callback(0, max_examples, "Reading files...")
        
        # Read file contents
        source_file_content = self.storage.get_file(source_file.storage_path)
        target_file_content = self.storage.get_file(target_file.storage_path)
        source_content = safe_decode_content(source_file_content)
        target_content = safe_decode_content(target_file_content)
        
        # CRITICAL: Maintain line alignment
        source_lines = [line.strip() for line in source_content.split('\n')]
        target_lines = [line.strip() for line in target_content.split('\n')]
        
        # Ensure same number of lines
        if len(source_lines) != len(target_lines):
            min_len = min(len(source_lines), len(target_lines))
            source_lines = source_lines[:min_len]
            target_lines = target_lines[:min_len]
        
        # Find valid examples (both lines must be longer than 10 characters)
        valid_pairs = []
        for i, (source_line, target_line) in enumerate(zip(source_lines, target_lines)):
            if len(source_line) > 10 and len(target_line) > 10:
                valid_pairs.append({
                    "line_number": i + 1,
                    "source_text": source_line,
                    "target_text": target_line
                })
        
        if not valid_pairs:
            raise ValueError("No valid training examples found")
        
        if progress_callback:
            progress_callback(0, max_examples, "Selecting examples...")
        
        # Select up to max_examples randomly
        if len(valid_pairs) > max_examples:
            selected_pairs = random.sample(valid_pairs, max_examples)
        else:
            selected_pairs = valid_pairs
        
        # Get instructions - pair-specific first, then project fallback
        instructions = self._get_training_instructions(project_id, source_file_id, target_file_id, project)
        
        # Create context-aware instruction fine-tuning examples
        system_prompt = f"You are an expert Bible translator specializing in {project.target_language} translation. Translate biblical text accurately while maintaining the meaning, tone, and style appropriate for {project.audience}. Use a {project.style} translation approach."
        
        if instructions:
            system_prompt += f"\n\nSpecific translation instructions:\n{instructions}"
        
        source_file_id_str = f"file_{source_file_id}"
        target_file_id_str = f"file_{target_file_id}"
        
        training_examples = []
        
        for i, pair in enumerate(selected_pairs):
            source_text = pair["source_text"]
            target_text = pair["target_text"]
            
            if progress_callback:
                progress_callback(i + 1, len(selected_pairs), f"Processing example {i + 1}/{len(selected_pairs)}: Finding context...")
            
            try:
                # Use source text as query to find context examples (limit to 5 for performance)
                context_examples, _ = _get_translation_examples(
                    project_id, source_file_id_str, target_file_id_str, source_text
                )
                
                # Remove the exact match if it appears in context and limit to 5 examples
                context_examples = [ex for ex in context_examples if source_text not in ex][:5]
                
            except Exception as e:
                print(f"Context search failed for example {i + 1}: {str(e)}")
                context_examples = []
            
            # Create context-aware instruction
            user_prompt = _create_instruction_prompt(source_text, context_examples)
            training_example = _create_training_example(system_prompt, user_prompt, target_text)
            training_examples.append(training_example)
        
        if progress_callback:
            progress_callback(len(selected_pairs), len(selected_pairs), f"Generated {len(training_examples)} training examples with context")
        
        if not training_examples:
            raise ValueError("No valid training examples could be created")
        
        # Convert to JSONL format
        jsonl_content = '\n'.join([json.dumps(example) for example in training_examples])
        
        return jsonl_content, len(training_examples) 