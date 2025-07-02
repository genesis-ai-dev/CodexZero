import os
import json
from datetime import datetime

from models import db, LanguageRule, ProjectFile
from utils.file_helpers import save_project_file


def save_language_rules(project_id: int, rules_json: str):
    """Helper to save language rules for a project"""
    
    if not rules_json:
        return
    
    try:
        rules_data = json.loads(rules_json)
    except (json.JSONDecodeError, TypeError):
        return
    
    # Get existing rules for this project
    existing_rules = {rule.id: rule for rule in LanguageRule.query.filter_by(project_id=project_id).all()}
    processed_rule_ids = set()
    
    for rule_data in rules_data:
        title = rule_data.get('title', '').strip()
        description = rule_data.get('description', '').strip()
        order_index = rule_data.get('order_index', 0)
        rule_id = rule_data.get('id')
        
        if not title and not description:
            continue
        
        if rule_id and rule_id in existing_rules:
            # Update existing rule
            rule = existing_rules[rule_id]
            rule.title = title
            rule.description = description
            rule.order_index = order_index
            processed_rule_ids.add(rule_id)
        else:
            # Create new rule
            rule = LanguageRule(
                project_id=project_id,
                title=title,
                description=description,
                order_index=order_index
            )
            db.session.add(rule)
    
    # Remove rules that weren't included in the update
    for rule_id, rule in existing_rules.items():
        if rule_id not in processed_rule_ids:
            db.session.delete(rule)


def import_ulb_automatically(project_id: int):
    """Automatically import the ULB (Unlocked Literal Bible) into a new project"""
    corpus_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Corpus')
    ulb_filename = 'eng-engULB.txt'
    ulb_file_path = os.path.join(corpus_dir, ulb_filename)
    
    # Check if ULB file exists
    if not os.path.exists(ulb_file_path):
        print(f"ULB file not found at {ulb_file_path}")
        return
    
    # Check if project already has a ULB file to avoid duplicates
    existing_ulb = ProjectFile.query.filter(
        ProjectFile.project_id == project_id,
        ProjectFile.original_filename.contains('ULB')
    ).first()
    
    if existing_ulb:
        print(f"Project {project_id} already has a ULB file")
        return
    
    try:
        # Read the ULB file content
        with open(ulb_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Generate a descriptive filename
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        project_filename = f"English_ULB_auto_imported_{timestamp}.txt"
        
        # Save as project file
        save_project_file(
            project_id,
            file_content,
            project_filename,
            'ebible',  # ULB is in eBible format
            'text/plain'
        )
        
        print(f"Successfully auto-imported ULB for project {project_id}")
        
    except Exception as e:
        print(f"Error auto-importing ULB for project {project_id}: {e}")
        raise 