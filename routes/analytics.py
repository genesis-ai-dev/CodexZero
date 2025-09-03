from flask import Blueprint, request, jsonify, render_template
import json
from sqlalchemy import case, func, and_, or_
from collections import defaultdict
from datetime import datetime, date, timedelta
import math
from typing import Dict, List, Any, Optional

from models import db, AbTestEvent, AbTestResult
from routes.admin import admin_required
from sqlalchemy.exc import SQLAlchemyError


analytics = Blueprint('analytics', __name__)


def calculate_confidence_interval(successes: int, total: int, confidence: float = 0.95) -> tuple:
    """Calculate confidence interval for conversion rate using Wilson score interval"""
    if total == 0:
        return (0.0, 0.0)
    
    z = 1.96  # 95% confidence
    p = successes / total
    
    denominator = 1 + z**2 / total
    center = (p + z**2 / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * total)) / total) / denominator
    
    return (max(0, center - margin), min(1, center + margin))


def calculate_statistical_significance(variant_a: dict, variant_b: dict) -> dict:
    """Calculate statistical significance between two variants using Z-test"""
    n1, x1 = variant_a['total'], variant_a['wins']
    n2, x2 = variant_b['total'], variant_b['wins']
    
    if n1 == 0 or n2 == 0:
        return {'significant': False, 'p_value': 1.0, 'z_score': 0.0}
    
    p1 = x1 / n1
    p2 = x2 / n2
    
    # Pooled proportion
    p_pool = (x1 + x2) / (n1 + n2)
    
    # Standard error
    se = math.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
    
    if se == 0:
        return {'significant': False, 'p_value': 1.0, 'z_score': 0.0}
    
    # Z-score
    z_score = (p1 - p2) / se
    
    # Two-tailed p-value (approximation)
    p_value = 2 * (1 - 0.5 * (1 + math.erf(abs(z_score) / math.sqrt(2))))
    
    return {
        'significant': p_value < 0.05,
        'p_value': p_value,
        'z_score': z_score,
        'confidence': 'high' if p_value < 0.01 else 'medium' if p_value < 0.05 else 'low'
    }


def get_time_ago(dt: datetime) -> str:
    """Get human-readable time ago string"""
    now = datetime.utcnow()
    diff = now - dt
    
    if diff.days > 0:
        return f"{diff.days}d ago"
    elif diff.seconds > 3600:
        return f"{diff.seconds // 3600}h ago"
    elif diff.seconds > 60:
        return f"{diff.seconds // 60}m ago"
    else:
        return "Just now"


@analytics.route('/analytics/event', methods=['POST'])
def record_event():
    """Record a single A/B test event.
    Body: { test_name: str, variant: str, outcome: bool, user_id?: int, project_id?: int }
    """
    data = request.get_json() or {}
    test_name = (data.get('test_name') or '').strip()
    variant = (data.get('variant') or '').strip()
    outcome_raw = data.get('outcome')

    if not test_name or not variant:
        return jsonify({'success': False, 'error': 'test_name and variant are required'}), 400

    # Normalize outcome to boolean
    if isinstance(outcome_raw, bool):
        outcome = outcome_raw
    else:
        outcome = str(outcome_raw).lower() in ['1', 'true', 'yes', 'y']

    user_id = data.get('user_id')
    project_id = data.get('project_id')

    try:
        event = AbTestEvent(
            test_name=test_name,
            variant=variant,
            outcome=bool(outcome),
            user_id=user_id,
            project_id=project_id
        )
        db.session.add(event)
        db.session.commit()
        return jsonify({'success': True, 'id': event.id})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics.route('/admin/analytics')
@admin_required
def dashboard():
    """Modern A/B test analytics dashboard"""
    # Parse filters
    time_range = request.args.get('range', '30d')
    category_filter = request.args.get('category', '').strip()
    
    # Calculate time boundaries
    end_dt = datetime.utcnow()
    if time_range == '7d':
        start_dt = end_dt - timedelta(days=7)
    elif time_range == '30d':
        start_dt = end_dt - timedelta(days=30)
    elif time_range == '90d':
        start_dt = end_dt - timedelta(days=90)
    else:
        start_dt = end_dt - timedelta(days=30)
    
    # Get overview stats
    total_events = db.session.query(func.count(AbTestEvent.id)).filter(
        AbTestEvent.created_at >= start_dt
    ).scalar() or 0
    
    total_tests = db.session.query(func.count(func.distinct(AbTestEvent.test_name))).filter(
        AbTestEvent.created_at >= start_dt
    ).scalar() or 0
    
    # Get test summaries with statistical analysis
    query = db.session.query(
        AbTestEvent.test_name,
        AbTestEvent.variant,
        func.count(AbTestEvent.id).label('total'),
        func.sum(case((AbTestEvent.outcome == True, 1), else_=0)).label('wins')
    ).filter(AbTestEvent.created_at >= start_dt)
    
    if category_filter:
        query = query.filter(AbTestEvent.test_name.contains(category_filter))
    
    rows = query.group_by(AbTestEvent.test_name, AbTestEvent.variant).all()
    
    # Process test summaries
    test_summaries = defaultdict(list)
    for row in rows:
        wins = int(row.wins or 0)
        total = int(row.total or 0)
        rate = (wins / total) if total > 0 else 0.0
        
        # Calculate confidence interval
        ci_low, ci_high = calculate_confidence_interval(wins, total)
        
        test_summaries[row.test_name].append({
            'variant': row.variant,
            'wins': wins,
            'total': total,
            'rate': rate,
            'ci_low': ci_low,
            'ci_high': ci_high,
            'margin_error': (ci_high - ci_low) / 2
        })
    
    # Calculate statistical significance and determine winners
    enhanced_summaries = {}
    for test_name, variants in test_summaries.items():
        if len(variants) < 2:
            continue
            
        # Sort variants by conversion rate
        variants.sort(key=lambda x: x['rate'], reverse=True)
        
        # Calculate statistical significance between best and second best
        best = variants[0]
        second_best = variants[1] if len(variants) > 1 else None
        
        significance = None
        if second_best:
            significance = calculate_statistical_significance(best, second_best)
        
        # Assign status based on statistical significance
        for i, variant in enumerate(variants):
            if i == 0:  # Best performing
                if significance and significance['significant']:
                    variant['status'] = 'Winner'
                    variant['confidence'] = significance['confidence']
                else:
                    variant['status'] = 'Leading'
                    variant['confidence'] = 'low'
            else:
                variant['status'] = 'Losing'
                variant['confidence'] = 'low'
        
        enhanced_summaries[test_name] = {
            'variants': variants,
            'significance': significance,
            'sample_size': sum(v['total'] for v in variants),
            'total_conversions': sum(v['wins'] for v in variants)
        }
    
    # Get chart data for each test
    chart_data = {}
    for test_name in enhanced_summaries.keys():
        # Get daily data for this specific test
        daily_test_query = db.session.query(
            func.date(AbTestEvent.created_at).label('date'),
            AbTestEvent.variant,
            func.count(AbTestEvent.id).label('events'),
            func.sum(case((AbTestEvent.outcome == True, 1), else_=0)).label('conversions')
        ).filter(
            and_(
                AbTestEvent.created_at >= start_dt,
                AbTestEvent.test_name == test_name
            )
        ).group_by(func.date(AbTestEvent.created_at), AbTestEvent.variant).all()
        
        # Process daily data
        daily_by_variant = defaultdict(lambda: defaultdict(lambda: {'events': 0, 'conversions': 0}))
        all_dates = set()
        
        for row in daily_test_query:
            date_str = row.date.strftime('%Y-%m-%d')
            daily_by_variant[row.variant][date_str] = {
                'events': row.events,
                'conversions': row.conversions
            }
            all_dates.add(date_str)
        
        # Format for charts
        dates = sorted(list(all_dates))
        line_datasets = []
        pie_data = {'labels': [], 'data': []}
        
        for variant_data in enhanced_summaries[test_name]['variants']:
            # Line chart data (conversion rates over time)
            conversion_rates = []
            for date in dates:
                day_data = daily_by_variant[variant_data['variant']].get(date, {'events': 0, 'conversions': 0})
                rate = (day_data['conversions'] / day_data['events'] * 100) if day_data['events'] > 0 else 0
                conversion_rates.append(round(rate, 2))
            
            line_datasets.append({
                'label': variant_data['variant'],
                'data': conversion_rates
            })
            
            # Pie chart data (total conversions)
            pie_data['labels'].append(variant_data['variant'])
            pie_data['data'].append(variant_data['wins'])
        
        chart_data[test_name] = {
            'line': {
                'dates': dates,
                'datasets': line_datasets
            },
            'pie': pie_data
        }
    

    
    # Get available categories for filter
    available_categories = sorted({r.test_name for r in rows})
    
    dashboard_data = {
        'overview': {
            'total_events': total_events,
            'total_tests': total_tests,
            'time_range': time_range
        },
        'test_summaries': enhanced_summaries,
        'chart_data': chart_data,
        'available_categories': available_categories,
        'active_filters': {
            'range': time_range,
            'category': category_filter
        }
    }
    
    return render_template('admin/analytics.html', **dashboard_data)


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


@analytics.route('/api/analytics/summary')
@admin_required
def api_summary():
    """API endpoint for dashboard summary data"""
    time_range = request.args.get('range', '30d')
    
    end_dt = datetime.utcnow()
    if time_range == '7d':
        start_dt = end_dt - timedelta(days=7)
    elif time_range == '30d':
        start_dt = end_dt - timedelta(days=30)
    elif time_range == '90d':
        start_dt = end_dt - timedelta(days=90)
    else:
        start_dt = end_dt - timedelta(days=30)
    
    # Get key metrics
    metrics = {
        'total_events': db.session.query(func.count(AbTestEvent.id)).filter(
            AbTestEvent.created_at >= start_dt
        ).scalar() or 0,
        'active_tests': db.session.query(func.count(func.distinct(AbTestEvent.test_name))).filter(
            AbTestEvent.created_at >= start_dt
        ).scalar() or 0,
        'avg_conversion': db.session.query(
            func.avg(case((AbTestEvent.outcome == True, 1.0), else_=0.0))
        ).filter(AbTestEvent.created_at >= start_dt).scalar() or 0
    }
    
    return jsonify(metrics)


@analytics.route('/analytics/generate-sample-data', methods=['POST'])
@admin_required
def generate_sample_data():
    """Generate sample A/B test data for demo purposes"""
    try:
        import random
        from datetime import timedelta
        
        # Clear existing data
        db.session.query(AbTestEvent).delete()
        db.session.query(AbTestResult).delete()
        
        # Generate sample test events
        test_configs = [
            {'name': 'Button Color Test', 'variants': ['Blue Button', 'Green Button', 'Red Button']},
            {'name': 'CTA Text Test', 'variants': ['Get Started', 'Try Now', 'Start Free']},
            {'name': 'Landing Page Layout', 'variants': ['Layout A', 'Layout B']},
            {'name': 'Email Subject Line', 'variants': ['Urgent Update', 'Weekly Newsletter', 'Important News']},
            {'name': 'Pricing Display', 'variants': ['Monthly First', 'Annual First']}
        ]
        
        # Generate events over the last 30 days
        base_time = datetime.utcnow() - timedelta(days=30)
        
        for config in test_configs:
            for variant in config['variants']:
                # Generate different conversion rates for each variant
                if 'Blue' in variant or 'Get Started' in variant or 'Layout A' in variant:
                    conversion_rate = 0.15  # Higher conversion
                elif 'Green' in variant or 'Try Now' in variant:
                    conversion_rate = 0.12
                else:
                    conversion_rate = 0.08  # Lower conversion
                
                # Generate 100-500 events per variant over 30 days
                num_events = random.randint(100, 500)
                
                for i in range(num_events):
                    # Random time within the last 30 days
                    random_offset = timedelta(
                        days=random.randint(0, 29),
                        hours=random.randint(0, 23),
                        minutes=random.randint(0, 59)
                    )
                    event_time = base_time + random_offset
                    
                    # Determine outcome based on conversion rate
                    outcome = random.random() < conversion_rate
                    
                    event = AbTestEvent(
                        test_name=config['name'],
                        variant=variant,
                        outcome=outcome,
                        created_at=event_time
                    )
                    db.session.add(event)
        
        # Generate some sample results
        sample_results = [
            {'category': 'Button Color Test', 'options': ['Blue', 'Green', 'Red'], 'winner': 0},
            {'category': 'CTA Text Test', 'options': ['Get Started', 'Try Now', 'Start Free'], 'winner': 0},
            {'category': 'Email Campaign', 'options': ['Subject A', 'Subject B'], 'winner': 1},
        ]
        
        for result_data in sample_results:
            result = AbTestResult(
                category=result_data['category'],
                options_json=json.dumps(result_data['options']),
                winner_index=result_data['winner'],
                winner_name=result_data['options'][result_data['winner']],
                created_at=datetime.utcnow() - timedelta(days=random.randint(1, 10))
            )
            db.session.add(result)
        
        db.session.commit()
        return jsonify({'success': True, 'message': 'Sample data generated successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics.route('/analytics/clear-data', methods=['POST'])
@admin_required
def clear_data():
    """Clear all A/B test data"""
    try:
        # Clear all test events and results
        deleted_events = db.session.query(AbTestEvent).delete()
        deleted_results = db.session.query(AbTestResult).delete()
        
        db.session.commit()
        return jsonify({
            'success': True, 
            'message': f'Cleared {deleted_events} events and {deleted_results} results'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500