# CodexZero Coding Rules

## 🚫 **RULE #1: NO ERROR AVOIDANCE CODE**

**NEVER add any of the following error avoidance patterns anywhere in this codebase:**

### ❌ **Prohibited Patterns:**

1. **API Key/Environment Variable Validation**
   ```python
   # NEVER DO THIS:
   if not api_key:
       raise ValueError("API key is required")
   
   # DO THIS INSTEAD:
   self.client = SomeClient(api_key=api_key)  # Let it fail naturally
   ```

2. **Default Value Fallbacks**
   ```python
   # NEVER DO THIS:
   value = user_input or "default_value"
   system_prompt = prompt or "You are a helpful assistant"
   
   # DO THIS INSTEAD:
   value = user_input  # Let None be None
   system_prompt = prompt  # Pass whatever was given
   ```

3. **Parameter Default Values with Safety Nets**
   ```python
   # NEVER DO THIS:
   def function(param: str = "safe_default"):
   
   # DO THIS INSTEAD:
   def function(param: str):  # Make it required
   ```

4. **Try-Catch for Missing Dependencies**
   ```python
   # NEVER DO THIS:
   try:
       import some_library
   except ImportError:
       print("Warning: library not found")
       some_library = None
   
   # DO THIS INSTEAD:
   import some_library  # Let it crash if missing
   ```

5. **Existence Checks Before Operations**
   ```python
   # NEVER DO THIS:
   if hasattr(obj, 'method'):
       obj.method()
   
   if key in dict:
       return dict[key]
   
   # DO THIS INSTEAD:
   obj.method()  # Let AttributeError happen
   return dict[key]  # Let KeyError happen
   ```

6. **Input Validation and Sanitization**
   ```python
   # NEVER DO THIS:
   if not isinstance(value, str):
       raise TypeError("Value must be string")
   
   if len(text) == 0:
       raise ValueError("Text cannot be empty")
   
   # DO THIS INSTEAD:
   # Just use the value - let type errors happen naturally
   ```

7. **Graceful Degradation**
   ```python
   # NEVER DO THIS:
   try:
       result = primary_method()
   except Exception:
       result = fallback_method()
   
   # DO THIS INSTEAD:
   result = primary_method()  # Let it fail if it fails
   ```

### ✅ **Philosophy: FAIL FAST AND LOUD**

- **Let Python's built-in exceptions do their job**
- **Don't mask problems with fallbacks**
- **Don't validate inputs - let the receiving code crash**
- **Don't provide safety nets - problems should surface immediately**
- **Don't catch exceptions unless you're genuinely handling them**

### 🎯 **Benefits of This Rule:**

1. **Faster Development**: No time wasted on defensive coding
2. **Clearer Bugs**: Issues surface immediately at their source
3. **Simpler Code**: Less branching, fewer conditionals
4. **Better Performance**: No overhead from checks and validations
5. **Honest APIs**: Functions communicate their real requirements

### ⚡ **Enforcement:**

- **Code reviews must reject any error avoidance patterns**
- **If something breaks, fix the root cause, don't add protection**
- **When in doubt, choose the path that will crash fastest**

---

*"It's better to crash spectacularly than to limp along silently broken."* 