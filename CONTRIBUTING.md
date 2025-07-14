# Contributing to CodexZero

Thank you for your interest in contributing to CodexZero! We welcome contributions from the community and are excited to see what you build.

## 🎯 Our Philosophy

CodexZero follows a unique **"Fail Fast and Loud"** development philosophy. Please read [CODING_RULES.md](CODING_RULES.md) to understand our approach before contributing. This is not typical defensive programming - we deliberately avoid error handling to surface problems immediately.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/CodexZero.git
   cd CodexZero
   ```
3. **Set up the development environment**:
   ```bash
   pip install -r requirements.txt
   cp env_template.txt .env
   # Edit .env with your API keys and database credentials
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🛠 Development Guidelines

### Code Style
- Follow existing code patterns and structure
- Keep functions focused and single-purpose
- Use descriptive variable and function names
- **NO defensive programming** - let errors surface naturally

### Testing
- Test your changes thoroughly in development mode
- Ensure the application starts and core features work
- Test with both example data and real translation projects

### Database Changes
- If you modify models, create a migration script in `migrations/`
- Test migrations on a copy of production data
- Document any breaking changes

## 📝 Submitting Changes

### Pull Request Process
1. **Update documentation** if you've changed functionality
2. **Add or update tests** for new features
3. **Ensure your code follows our philosophy** (see CODING_RULES.md)
4. **Write clear commit messages**:
   ```
   Add fine-tuning progress tracking
   
   - Add progress percentage calculation
   - Update UI to show training status
   - Store training metadata in database
   ```

### What We Look For
- ✅ Clear, focused changes that solve specific problems
- ✅ Code that follows our "fail fast" philosophy
- ✅ Good documentation and clear commit messages
- ✅ Features that benefit Bible translators

### What We Avoid
- ❌ Defensive programming patterns (see CODING_RULES.md)
- ❌ Generic features that dilute the Bible translation focus
- ❌ Complex changes without clear user benefit
- ❌ Breaking changes without migration paths

## 🐛 Reporting Issues

### Bug Reports
When reporting bugs, please include:
- Steps to reproduce the issue
- Expected vs actual behavior
- Browser/environment details
- Any error messages or logs

### Feature Requests
For new features, please describe:
- The specific Bible translation workflow you're trying to improve
- How the feature would benefit translators
- Any implementation ideas you have

## 🎯 Contribution Areas

We especially welcome contributions in these areas:

### Core Translation Features
- Improved AI prompt engineering
- Enhanced translation confidence scoring
- Better example selection algorithms
- Translation quality metrics

### User Experience
- Improved translation interface
- Better progress tracking and visualization
- Enhanced project collaboration features
- Mobile-responsive design improvements

### Performance & Scalability
- Database query optimization
- Caching strategies
- Background job processing
- File upload/storage improvements

### Documentation
- Tutorial videos or guides
- API documentation
- Deployment guides for other platforms
- Translation workflow best practices

## 🤝 Community Guidelines

- **Be respectful** and constructive in discussions
- **Focus on Bible translation needs** - this is a specialized tool
- **Ask questions** if you're unsure about our approach
- **Share your translation expertise** if you work in the field

## 📚 Resources

- **[Complete Documentation](AI_README.md)** - Project architecture and features
- **[Setup Guide](SETUP.md)** - Development environment setup
- **[Coding Philosophy](CODING_RULES.md)** - Our unique approach to error handling
- **[Deployment Guide](DIGITAL_OCEAN_DEPLOY.md)** - Production deployment

## ⚡ Quick Tips

- **Start small** - fix bugs or improve documentation before major features
- **Ask first** - open an issue to discuss major changes before coding
- **Test thoroughly** - Bible translation accuracy is critical
- **Embrace failures** - our philosophy means crashes reveal problems early

## 📞 Getting Help

- **Open an issue** for bugs or feature discussions
- **Check existing issues** before creating new ones
- **Review our documentation** for answers to common questions

Thank you for helping make Bible translation more accessible worldwide! 🌍✨ 