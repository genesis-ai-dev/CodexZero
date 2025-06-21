# FLUX.1 Kontext Image Generator

A Python script that uses the Black Forest Labs FLUX.1 Kontext API to generate and display AI images from text prompts.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set your API key:**
   ```bash
   export BFL_API_KEY="your_api_key_here"
   ```
   
   Get your API key from [Black Forest Labs](https://docs.bfl.ai/).

## Usage

### Interactive Mode
```bash
python image_generator.py
```

The script provides an interactive menu where you can:
- Enter custom prompts
- Choose from example prompts
- Set aspect ratios (1:1, 16:9, 3:4, etc.)

### Programmatic Usage
```python
from image_generator import FluxImageGenerator

generator = FluxImageGenerator()
result = generator.generate_and_show(
    prompt="A small furry elephant pet looks out from a cat house",
    aspect_ratio="1:1"
)
```

## Features

- **Text-to-Image Generation**: Create images from text descriptions
- **Aspect Ratio Control**: Support for various aspect ratios (3:7 to 7:3)
- **Automatic Display**: Downloads and shows generated images
- **Progress Tracking**: Real-time status updates during generation
- **Error Handling**: Robust error handling and user feedback
- **File Management**: Automatic timestamped file naming

## Example Prompts

- "A small furry elephant pet looks out from a cat house"
- "Abstract expressionist painting Pop Art and cubism, cute cat face, warm colors"
- "A cute round rusted robot repairing a classic pickup truck, van gogh style"

## API Parameters

- **prompt**: Text description of desired image (required)
- **aspect_ratio**: Image dimensions (default: "1:1")
- **seed**: For reproducible results (optional)
- **output_format**: "jpeg" or "png" (default: "jpeg")

## Requirements

- Python 3.7+
- BFL API key
- Internet connection 