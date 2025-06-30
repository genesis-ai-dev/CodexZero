# Fine-Tuning Guide

This guide explains how to use OpenAI's fine-tuning functionality integrated into CodexZero.

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Migration**:
   ```bash
   python migrate_fine_tuning.py
   ```

3. **Environment Variables**:
   Add your OpenAI API key to your environment:
   ```bash
   export OPENAI_API_KEY="your-openai-api-key-here"
   ```

## How Fine-Tuning Works

Fine-tuning creates a custom model trained on your specific translation pairs. This can improve translation quality for your target language and style.

CodexZero offers two types of fine-tuning:

### Regular Fine-Tuning
Trains on all line-by-line translation pairs from your files. Uses every verse or sentence as a training example.

### Instruction Fine-Tuning  
Uses the context query system to find examples similar to your query text, then trains the model to follow instructions with context examples. Limited to 100 examples maximum for focused training.

### Requirements

- **Paired Files**: You need source and target files that are line-by-line translations
- **Minimum 50 examples** (though 500+ is recommended for better results)
- **Aligned Content**: Each line in source file corresponds to same line in target file

### Process

1. **Upload Files**: Add your source and target text files to the project
2. **Pair Files**: Use the "Pair" button to link source → target files
3. **Start Fine-Tuning**: Go to Fine-Tuning section, select a pair, and start training

## Using the Feature

### Step 1: Prepare Your Data

Your files should be formatted like this:

**source.txt** (English):
```
In the beginning was the Word
And the Word was with God
The Word became flesh
```

**target.txt** (Spanish):
```
En el principio era el Verbo
Y el Verbo era con Dios
El Verbo se hizo carne
```

### Step 2: Upload and Pair

1. Go to your project page
2. Click "Add Files" 
3. Upload both source and target files
4. Use the "Pair" button to link them as parallel texts

### Step 3: Fine-Tune

**For Regular Fine-Tuning:**
1. In the Fine-Tuning section, ensure "Regular Fine-tuning" tab is selected
2. Select your file pair
3. Choose a base model (GPT-4o, GPT-4o Mini) or an existing fine-tuned model
4. Review the cost estimate
5. **Preview a training example** to verify your data looks correct
6. Click "Start Fine-Tuning"
7. Wait 1-3 hours for completion

**For Instruction Fine-Tuning:**
1. Click the "Instruction Fine-tuning" tab
2. Select your file pair
3. Choose a base model or existing fine-tuned model
4. Enter a query text (e.g., "love your enemies" or "kingdom of heaven")
5. Choose max examples (25-100)
6. Review the cost estimate
7. **Preview a training example** to see the instruction format
8. Click "Start Fine-Tuning"
9. Wait 1-3 hours for completion

### Step 4: Use Your Model

Once complete, your custom model will be available for translations. **Important:** You must give your model a custom name for it to appear in the model selection dropdown. Models without custom names are hidden to keep the interface clean.

## Available Models

You can choose from base models and your custom-named fine-tuned models:

**Base Models:**
- **GPT-4o** (`gpt-4o`) - Most capable multimodal model
  - Best for complex translation tasks requiring high quality
  - Training cost: ~$0.015 per 1K tokens
  
- **GPT-4o Mini** (`gpt-4o-mini`) - Fast and cost-effective (default)
  - Great balance of performance and cost
  - Training cost: ~$0.003 per 1K tokens

**Fine-tuned Models:**
- Only models with custom display names will appear in the selection dropdown
- Any of your completed fine-tuned models can be used as a base for additional training
- This allows you to iteratively improve your models with new training data
- Useful for domain adaptation or adding specialized vocabulary

## Cost Information

- **Training Cost**: Varies by model (see above)
- **Hosting Cost**: ~$0.0006 per hour for deployment
- **Usage Cost**: Standard OpenAI pricing for inference

### Example Costs (GPT-4o Mini)
- 1,000 examples ≈ $0.90 training cost
- 10,000 examples ≈ $9.00 training cost

## Best Practices

### Regular Fine-Tuning
1. **Quality over Quantity**: 500 high-quality examples beat 5,000 poor ones
2. **Preview Before Training**: Always preview a training example to verify alignment
3. **Consistent Style**: Ensure your training data matches your desired output style
4. **Line Alignment**: Verify source and target files have matching line counts
5. **Diverse Content**: Include various types of text (narrative, dialogue, etc.)

### Instruction Fine-Tuning
1. **Focused Queries**: Use specific query text that represents the type of content you want to improve
2. **Context Quality**: The system will use other examples as context, so ensure your file pairs are high quality
3. **Example Limit**: Start with 50 examples and adjust based on results
4. **Preview First**: Always preview to see how the context examples are formatted
5. **Iterative Training**: Use instruction fine-tuning to specialize existing fine-tuned models

## Troubleshooting

### Common Issues

**"Source and target files have different lengths"**
- Ensure both files have the same number of lines
- Remove empty lines or add placeholder text

**"Not enough training examples"**
- You need at least 10 examples, but 50+ recommended
- Filter out very short lines (less than 10 characters)

**"Training failed"**
- Check OpenAI API key is valid
- Verify file content is properly formatted
- Ensure you have sufficient API credits

### Getting Help

1. Check the training jobs list for error messages
2. Review your file pairing to ensure correct alignment
3. Verify your OpenAI API key has fine-tuning permissions

## API Integration

The fine-tuning functionality is also available via API:

```python
# Get available models
GET /project/{project_id}/fine-tuning/models

# Preview training example
POST /project/{project_id}/fine-tuning/preview
{
    "source_file_id": 123,
    "target_file_id": 456
}

# Start fine-tuning job
POST /project/{project_id}/fine-tuning/jobs
{
    "source_file_id": 123,
    "target_file_id": 456,
    "base_model": "gpt-4o-mini"
}

# Check job status
GET /project/{project_id}/fine-tuning/jobs/{job_id}/status

# Get cost estimate
POST /project/{project_id}/fine-tuning/estimate
{
    "source_file_id": 123,
    "target_file_id": 456,
    "base_model": "gpt-4o-mini"
}
```

## Files Added/Modified

- `models.py` - Added FineTuningJob model
- `ai/fine_tuning.py` - Fine-tuning service
- `app.py` - API routes
- `templates/project.html` - UI updates
- `static/js/project.js` - JavaScript functionality
- `migrate_fine_tuning.py` - Database migration
- `requirements.txt` - Added openai dependency 