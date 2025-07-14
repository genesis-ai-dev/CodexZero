from .local import LocalStorage
from .spaces import DigitalOceanSpaces
from .factory import get_storage

__all__ = ['LocalStorage', 'DigitalOceanSpaces', 'get_storage'] 