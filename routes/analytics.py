from flask import Blueprint, request, jsonify, render_template
import json
from collections import defaultdict
from datetime import datetime, timedelta

from models import db, AbTestResult
from routes.admin import admin_required
from sqlalchemy.exc import SQLAlchemyError


analytics = Blueprint('analytics', __name__)


@analytics.route('/admin/analytics')
@admin_required
def dashboard():
    """Simple A/B test results dashboard"""
    range_filter = request.args.get('range', '30d').strip()
    category_filter = request.args.get('category', '').strip()
    
    # Calculate time boundaries
    end_dt = datetime.utcnow()
    if range_filter == '7d':
        start_dt = end_dt - timedelta(days=7)
    elif range_filter == '30d':
        start_dt = end_dt - timedelta(days=30)
    elif range_filter == '90d':
        start_dt = end_dt - timedelta(days=90)
    else:
        start_dt = end_dt - timedelta(days=30)
    
    # Build query with filters
    query = AbTestResult.query.filter(AbTestResult.created_at >= start_dt)
    
    if category_filter:
        query = query.filter(AbTestResult.category.ilike(f'%{category_filter}%'))
    
    results = query.order_by(AbTestResult.created_at.desc()).all()
    
    # Group by category and count winners
    category_stats = defaultdict(lambda: defaultdict(int))
    for r in results:
        category_stats[r.category][r.winner_name] += 1
    
    # Build chart data
    charts = {}
    for category, winner_counts in category_stats.items():
        sorted_winners = sorted(winner_counts.items(), key=lambda x: -x[1])
        labels = [name for name, _ in sorted_winners]
        counts = [count for _, count in sorted_winners]
        
        charts[category] = {
            'labels': labels,
            'data': counts,
            'total': sum(counts)
        }
    
    available_categories = sorted({r.category for r in results})
    
    return render_template('admin/analytics.html', 
                         category_stats=category_stats,
                         charts=charts,
                         available_categories=available_categories,
                         active_filters={'range': range_filter, 'category': category_filter})


@analytics.route('/analytics/result', methods=['POST'])
def record_result():
    """Record a summarized A/B test result.
    Body: { category: str, options: [str], winner: int, user_id?: int, project_id?: int }
    """
    data = request.get_json() or {}
    category = (data.get('category') or '').strip()
    options = data.get('options') or []
    winner = data.get('winner')
    user_id = data.get('user_id')
    project_id = data.get('project_id')

    if not category:
        return jsonify({'success': False, 'error': 'category is required'}), 400
    if not isinstance(options, list) or len(options) == 0:
        return jsonify({'success': False, 'error': 'options must be a non-empty list'}), 400
    try:
        winner_index = int(winner)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'winner must be an integer index'}), 400
    if winner_index < 0 or winner_index >= len(options):
        return jsonify({'success': False, 'error': 'winner index out of range'}), 400

    winner_name = str(options[winner_index])

    try:
        result = AbTestResult(
            category=category,
            options_json=json.dumps(options),
            winner_index=winner_index,
            winner_name=winner_name,
            user_id=user_id,
            project_id=project_id
        )
        db.session.add(result)
        db.session.commit()
        return jsonify({'success': True, 'id': result.id})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

