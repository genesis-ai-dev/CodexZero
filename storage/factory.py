import os
from .local import LocalStorage
from .spaces import DigitalOceanSpaces

def get_storage():
    """Get the configured storage backend"""
    storage_type = os.getenv('STORAGE_TYPE', 'local')
    
    if storage_type == 'local':
        return LocalStorage(os.getenv('LOCAL_STORAGE_PATH', 'uploads'))
    elif storage_type == 'spaces':
        return DigitalOceanSpaces(
            region=os.getenv('DO_SPACES_REGION'),
            endpoint_url=os.getenv('DO_SPACES_ENDPOINT'),
            access_key=os.getenv('DO_SPACES_ACCESS_KEY'),
            secret_key=os.getenv('DO_SPACES_SECRET_KEY'),
            bucket_name=os.getenv('DO_SPACES_BUCKET')
        )
    else:
        raise ValueError(f"Unknown storage type: {storage_type}") 