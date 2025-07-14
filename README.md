# CodexZero - AI-Powered Bible Translation Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Zero draft Bible translation powered by AI**

CodexZero is a modern Flask web application that provides AI-assisted Bible translation tools. It helps translators work with Biblical texts by providing contextual translation suggestions, back-translation, quality checks, and OpenAI fine-tuning capabilities.

## ✨ Key Features

- **AI Translation**: Real-time translation with confidence scoring using Claude 3.5 Sonnet (best model for translation)
- **Fine-Tuning**: Custom GPT model training for specialized translation needs  
- **USFM Import**: Advanced Biblical text format support
- **Multi-User Projects**: Collaborative translation with role-based access

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/CodexZero.git
   cd CodexZero
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment**
   ```bash
   cp env_template.txt .env
   # Edit .env with your API keys and database credentials
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

Visit `http://localhost:5000` to get started!

## 🛠 Requirements

- Python 3.8+
- MySQL database
- OpenAI API key (for fine-tuning)
- Anthropic API key (for translation)
- Google OAuth credentials

## 🎯 Who It's For

- Bible translation organizations
- Missionary translators  
- Biblical studies researchers
- AI/ML developers interested in specialized translation tools

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

CodexZero is part of the Codex ecosystem:
- **[Codex Editor](https://codexeditor.app)** - Full-featured local translation app
---

