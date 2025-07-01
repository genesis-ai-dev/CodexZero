import os
from pathlib import Path
from typing import BinaryIO

class LocalStorage:
    """Local filesystem storage"""
    
    def __init__(self, base_path: str = "uploads"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
    
    def store_file(self, file_data: BinaryIO, file_path: str) -> str:
        """Store a file and return its storage path"""
        full_path = self.base_path / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'wb') as f:
            f.write(file_data.read())
        
        return str(full_path)
    
    def store_file_content(self, content: str, file_path: str) -> str:
        """Store string content as a file"""
        full_path = self.base_path / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return str(full_path)
    
    def get_file(self, file_path: str) -> bytes:
        """Retrieve file contents"""
        full_path = self.base_path / file_path
        with open(full_path, 'rb') as f:
            return f.read()
    
    def delete_file(self, file_path: str) -> None:
        """Delete a file"""
        full_path = self.base_path / file_path
        full_path.unlink()
    
    def get_file_url(self, file_path: str) -> str:
        """Get URL for a file (local file path)"""
        return f"/uploads/{file_path}"
    
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists"""
        full_path = self.base_path / file_path
        return full_path.exists() 